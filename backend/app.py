from dateutil import tz
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from io import BytesIO
import csv
from io import StringIO
from flask import Response
import bcrypt
import smtplib
from sqlalchemy import create_engine, text
from email.message import EmailMessage
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt,
    get_jwt_identity
)
import boto3
import os
import random
from datetime import datetime, timedelta

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"



app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False
)

app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=6)

DB_URL = os.getenv("DATABASE_URL")
engine = create_engine(DB_URL)

# =========================
# DB BOOTSTRAP (SAFE FOR RENDER)
# =========================
def init_db():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                email TEXT,
                active BOOLEAN DEFAULT TRUE
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                username TEXT,
                action TEXT,
                resource TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))

# =========================
# AUTO CREATE DEMO USER (RENDER SAFE)
# =========================
def ensure_demo_user():
    if not DEMO_MODE:
        return

    with engine.begin() as conn:
        result = conn.execute(
            text("SELECT 1 FROM users WHERE username = 'demo'")
        ).fetchone()

        if not result:
            conn.execute(
                text("""
                    INSERT INTO users (username, password, role, email, active)
                    VALUES (:u, :p, :r, :e, true)
                """),
                {
                    "u": "demo",
                    "p": hash_password("demo123"),
                    "r": "viewer",
                    "e": "demo@cloudcost.local"
                }
            )
            print("✅ Demo user created")

# =========================
# STARTUP INITIALIZATION (FLASK 3 SAFE)
# =========================
init_db()
ensure_demo_user()


# =========================
# JWT CONFIG
# =========================
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret")
jwt = JWTManager(app)


def cleanup_old_audit_logs(days: int):
    with engine.begin() as conn:
        conn.execute(
            text("""
                DELETE FROM audit_logs
                WHERE created_at < NOW() - (:days * INTERVAL '1 day')
            """),
            {"days": days}
        )


def log_action(username, action, resource):
    with engine.begin() as conn:   # ✅ auto-commit transaction
        conn.execute(
            text("""
                INSERT INTO audit_logs (username, action, resource)
                VALUES (:u, :a, :r)
            """),
            {"u": username, "a": action, "r": resource}
        )
        
        

# =========================
# HELPERS
# =========================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def is_admin():
    return get_jwt().get("role") == "admin"


# =========================
# OTP STORE (TEMP)
# =========================
OTP_STORE = {}

# =========================
# EMAIL CONFIG (GMAIL SMTP)
# =========================
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")     # 🔴 16-char app password
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


# =========================
# AWS CONFIG
# =========================
region = os.getenv("AWS_REGION", "ap-south-1")
ec2 = boto3.client("ec2", region_name=region)
cloudwatch = boto3.client("cloudwatch", region_name=region)

INSTANCE_PRICING = {
    "t3.micro": 0.0104,
    "t2.micro": 0.0116
}

# =========================
# ALERT THRESHOLDS
# =========================
MONTHLY_BUDGET_LIMIT = 50.0     # USD
CPU_SPIKE_THRESHOLD = 80.0      # %

def send_otp_email(to_email, otp):
    msg = EmailMessage()
    msg["Subject"] = "Cloud Cost Optimizer - OTP"
    msg["From"] = SMTP_EMAIL
    msg["To"] = to_email

    msg.set_content(f"""
Hello,

Your OTP for password reset is:

OTP: {otp}

This OTP is valid for 5 minutes.
Do NOT share it with anyone.

- Cloud Cost Optimizer Team
""")

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)


# =========================
# AUTH
# =========================
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT username, password, role, active
                FROM users
                WHERE username = :u
            """),
            {"u": username}
        ).fetchone()

    if result is None:
        return jsonify({"error": "Invalid credentials"}), 401

    if not verify_password(password, result.password):
        return jsonify({"error": "Invalid credentials"}), 401

    if not result.active:
        return jsonify({"error": "User is disabled"}), 403

    if DEMO_MODE and result.role == "admin":
        return jsonify({"error": "Admin login disabled in demo mode"}), 403

    token = create_access_token(
        identity=result.username,
        additional_claims={"role": result.role}
    )

    return jsonify({"access_token": token}), 200

# =========================
# FORGOT PASSWORD (OTP)
# =========================
@app.route("/forgot-password", methods=["POST"])
def forgot_password():
    username = request.json.get("username")

    # 1️⃣ Validate input
    if not username:
        return jsonify({"error": "Username required"}), 400

    # 2️⃣ Fetch user from PostgreSQL
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT email, active
                FROM users
                WHERE username = :u
            """),
            {"u": username}
        ).fetchone()

    # 3️⃣ User / email validation
    if not result or not result.email:
        return jsonify({"error": "User not found or email not set"}), 404

    if not result.active:
        return jsonify({"error": "User is disabled"}), 403

    # 4️⃣ Generate OTP
    otp = str(random.randint(100000, 999999))
    OTP_STORE[username] = otp

    # 5️⃣ Send OTP email
    try:
        send_otp_email(result.email, otp)
    except Exception as e:
        print("OTP EMAIL ERROR:", e)
        return jsonify({"error": "Failed to send OTP email"}), 500

    return jsonify({"message": "OTP sent to registered email"})

@app.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.json
    username = data.get("username")
    otp = data.get("otp")
    new_password = data.get("new_password")

    if OTP_STORE.get(username) != otp:
        return jsonify({"error": "Invalid OTP"}), 400

    hashed = hash_password(new_password)

    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE users
                SET password = :p
                WHERE username = :u
            """),
            {"p": hashed, "u": username}
        )
        conn.commit()

    del OTP_STORE[username]

    return jsonify({"message": "Password reset successful"})

# =========================
# USER MANAGEMENT (ADMIN)
# =========================
@app.route("/users", methods=["GET"])
@jwt_required()
def list_users():
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT username, role, email, active
                FROM users
                ORDER BY username
            """)
        ).fetchall()

    return jsonify([
        {
            "username": row.username,
            "role": row.role,
            "email": row.email,
            "active": row.active
        }
        for row in result
    ])

@app.route("/users", methods=["POST"])
@jwt_required()
def create_user():
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    data = request.json
    username = data.get("username")
    password = data.get("password")
    role = data.get("role")
    email = data.get("email", "")

    if not username or not password or not role:
        return jsonify({"error": "Missing fields"}), 400

    hashed = hash_password(password)

    with engine.connect() as conn:
        # Check if user already exists
        exists = conn.execute(
            text("SELECT 1 FROM users WHERE username = :u"),
            {"u": username}
        ).fetchone()

        if exists:
            return jsonify({"error": "User already exists"}), 400

        # Insert new user
        conn.execute(
            text("""
                INSERT INTO users (username, password, role, email, active)
                VALUES (:u, :p, :r, :e, true)
            """),
            {
                "u": username,
                "p": hashed,
                "r": role,
                "e": email
            }
        )
        conn.commit()

    return jsonify({"message": "User created successfully"})

@app.route("/users/<username>/toggle", methods=["POST"])
@jwt_required()
def toggle_user(username):
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    if username == get_jwt_identity():
        return jsonify({"error": "Cannot disable yourself"}), 400

    with engine.connect() as conn:
        user = conn.execute(
            text("""
                SELECT active
                FROM users
                WHERE username = :u
            """),
            {"u": username}
        ).fetchone()

        if not user:
            return jsonify({"error": "User not found"}), 404

        new_status = not user.active

        conn.execute(
            text("""
                UPDATE users
                SET active = :a
                WHERE username = :u
            """),
            {"a": new_status, "u": username}
        )
        conn.commit()

    return jsonify({
        "username": username,
        "active": new_status
    })

@app.route("/users/<username>", methods=["DELETE"])
@jwt_required()
def delete_user(username):
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    if username == get_jwt_identity():
        return jsonify({"error": "Cannot delete yourself"}), 400

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                DELETE FROM users
                WHERE username = :u
            """),
            {"u": username}
        )

        if result.rowcount == 0:
            return jsonify({"error": "User not found"}), 404

        conn.commit()

    return jsonify({"message": "User deleted successfully"})
# =========================
# AUDIT LOGS (ADMIN VIEW)
# =========================
@app.route("/audit-logs", methods=["GET"])
@jwt_required()
def get_audit_logs():
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 10))
    offset = (page - 1) * limit

    cleanup_old_audit_logs(7)

    from_date = request.args.get("from")
    to_date = request.args.get("to")

    query = """
        SELECT username, action, resource, created_at
        FROM audit_logs
    """
    params = {
        "limit": limit,
        "offset": offset
    }

    if from_date and to_date:
        query += " WHERE created_at BETWEEN :f AND :t"
        params["f"] = from_date
        params["t"] = to_date

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).fetchall()
        total = conn.execute(
            text("SELECT COUNT(*) FROM audit_logs")
        ).scalar()

    # ✅ IST CONVERSION
    ist = tz.gettz("Asia/Kolkata")

    return jsonify({
        "data": [
            {
                "username": r.username,
                "action": r.action,
                "resource": r.resource,
                "created_at": r.created_at.replace(
                    tzinfo=tz.UTC
                ).astimezone(ist).strftime("%d/%m/%Y, %I:%M:%S %p")
            }
            for r in rows
        ],
        "page": page,
        "limit": limit,
        "total": total
    })
    
    # =========================
# CLEAR AUDIT LOGS (ADMIN)
# =========================
@app.route("/audit-logs/clear", methods=["POST"])
@jwt_required()
def clear_audit_logs():
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    data = request.json or {}
    days = int(data.get("days", 0))  # 0 = clear all

    with engine.begin() as conn:
        if days > 0:
            conn.execute(
                text("""
                    DELETE FROM audit_logs
                    WHERE created_at < NOW() - (:days * INTERVAL '1 day')
                """),
                {"days": days}
            )
        else:
            conn.execute(text("DELETE FROM audit_logs"))

    return jsonify({"message": "Audit logs cleared successfully"})



# =========================
# AUDIT LOGS (ADMIN)
# =========================
@app.route("/audit-logs/export", methods=["GET"])
@jwt_required()
def export_audit_logs():
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    cleanup_old_audit_logs(7)

    from_date = request.args.get("from")
    to_date = request.args.get("to")

    query = """
        SELECT username, action, resource, created_at
        FROM audit_logs
    """
    params = {}

    if from_date and to_date:
        query += " WHERE created_at BETWEEN :f AND :t"
        params["f"] = from_date
        params["t"] = to_date

    query += " ORDER BY created_at DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).fetchall()

    # ✅ IST timezone
    ist = tz.gettz("Asia/Kolkata")

    # 🔹 Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["Username", "Action", "Resource", "Time (IST)"])

    # Rows
    for r in rows:
        writer.writerow([
            r.username,
            r.action,
            r.resource,
            r.created_at.replace(
                tzinfo=tz.UTC
            ).astimezone(ist).strftime("%d/%m/%Y, %I:%M:%S %p")
        ])

    output.seek(0)

    return Response(
        output,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=audit_logs.csv"
        }
    )
    
  # =========================
# AUDIT LOGS PDF EXPORT (ADMIN)
# =========================
@app.route("/audit-logs/export-pdf", methods=["GET"])
@jwt_required()
def export_audit_logs_pdf():
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    cleanup_old_audit_logs(7)

    from_date = request.args.get("from")
    to_date = request.args.get("to")

    query = """
        SELECT username, action, resource, created_at
        FROM audit_logs
    """
    params = {}

    if from_date and to_date:
        query += " WHERE created_at BETWEEN :f AND :t"
        params["f"] = from_date
        params["t"] = to_date

    query += " ORDER BY created_at DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).fetchall()

    # ✅ IST timezone
    ist = tz.gettz("Asia/Kolkata")

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - inch
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(inch, y, "Audit Logs Report (IST)")

    y -= 0.5 * inch
    pdf.setFont("Helvetica", 10)

    for r in rows:
        ist_time = (
            r.created_at
            .replace(tzinfo=tz.UTC)
            .astimezone(ist)
            .strftime("%d/%m/%Y, %I:%M:%S %p")
        )

        line = f"{ist_time} | {r.username} | {r.action} | {r.resource}"
        pdf.drawString(inch, y, line)
        y -= 14

        if y < inch:
            pdf.showPage()
            pdf.setFont("Helvetica", 10)
            y = height - inch

    pdf.save()
    buffer.seek(0)

    return Response(
        buffer,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=audit_logs.pdf"
        }
    )

# =========================
# INSTANCES
# =========================
@app.route("/instances")
@jwt_required()
def instances():
    response = ec2.describe_instances()
    data = []

    for r in response["Reservations"]:
        for inst in r["Instances"]:
            itype = inst["InstanceType"]
            state = inst["State"]["Name"]
            monthly = round(INSTANCE_PRICING.get(itype, 0) * 24 * 30, 2)

            cpu = cloudwatch.get_metric_statistics(
                Namespace="AWS/EC2",
                MetricName="CPUUtilization",
                Dimensions=[{"Name": "InstanceId", "Value": inst["InstanceId"]}],
                StartTime=datetime.utcnow() - timedelta(hours=1),
                EndTime=datetime.utcnow(),
                Period=300,
                Statistics=["Average"]
            )

            avg = round(
                sum(d["Average"] for d in cpu["Datapoints"]) / len(cpu["Datapoints"]), 2
            ) if cpu["Datapoints"] else 0
            
            alerts = []

            if monthly > MONTHLY_BUDGET_LIMIT:
                  alerts.append("Monthly cost exceeds budget")

            if avg > CPU_SPIKE_THRESHOLD:
                  alerts.append("CPU spike detected")



            recommendation = (
                "IDLE – STOP INSTANCE" if state == "running" and avg < 5 else
                "LOW USAGE – CONSIDER DOWNSIZE" if state == "running" and avg < 15 else
                "STOPPED – NO COST" if state == "stopped" else
                "HEALTHY"
            )

            data.append({
                "InstanceId": inst["InstanceId"],
                "InstanceType": itype,
                "State": state,
                "AvgCPUUtilization": avg,
                "EstimatedMonthlyCostUSD": monthly,
                "Recommendation": recommendation,
                "Alerts": alerts   # ✅ NEW
            })
            
    return jsonify(data)

@app.route("/instances/<instance_id>/cpu-history")
@jwt_required()
def instance_cpu_history(instance_id):
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    response = cloudwatch.get_metric_statistics(
        Namespace="AWS/EC2",
        MetricName="CPUUtilization",
        Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
        StartTime=datetime.utcnow() - timedelta(hours=24),
        EndTime=datetime.utcnow(),
        Period=3600,  # 1 hour
        Statistics=["Average"]
    )

    data = sorted(response["Datapoints"], key=lambda x: x["Timestamp"])

    return jsonify([
        {
            "time": d["Timestamp"].isoformat(),
            "cpu": round(d["Average"], 2)
        }
        for d in data
    ])
    
@app.route("/instances/<instance_id>/cost-history")
@jwt_required()
def instance_cost_history(instance_id):
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    instance = ec2.describe_instances(
        InstanceIds=[instance_id]
    )["Reservations"][0]["Instances"][0]

    itype = instance["InstanceType"]
    hourly = INSTANCE_PRICING.get(itype, 0)

    data = []
    for i in range(7):  # last 7 days
        data.append({
            "day": (datetime.utcnow() - timedelta(days=i)).date().isoformat(),
            "cost": round(hourly * 24, 2)
        })

    return jsonify(list(reversed(data)))

# =========================
# EC2 ACTIONS (ADMIN)
# =========================
@app.route("/start/<instance_id>", methods=["POST"])
@jwt_required()
def start_instance(instance_id):
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    ec2.start_instances(InstanceIds=[instance_id])

    # 🔥 AUDIT LOG
    log_action(
        username=get_jwt_identity(),
        action="START",
        resource=instance_id
    )
    
    cleanup_old_audit_logs(7)  # keep last 7 days

    return jsonify({"status": "starting"})

@app.route("/stop/<instance_id>", methods=["POST"])
@jwt_required()
def stop_instance(instance_id):
    if not is_admin():
        return jsonify({"error": "Admins only"}), 403

    ec2.stop_instances(InstanceIds=[instance_id])

    # 🔥 AUDIT LOG
    log_action(
        username=get_jwt_identity(),
        action="STOP",
        resource=instance_id
    )
    
    cleanup_old_audit_logs(7)  # keep last 7 days

    return jsonify({"status": "stopping"})

# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)