import bcrypt
from sqlalchemy import create_engine, text

def hash_password(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

engine = create_engine(
    "postgresql://cloud_user:cloud123@localhost/cloud_optimizer"
)

with engine.connect() as conn:
    conn.execute(text("""
        INSERT INTO users (username, password, role, email, active)
        VALUES
        (:u1, :p1, 'admin', 'admin@example.com', true),
        (:u2, :p2, 'viewer', 'viewer@example.com', true)
        ON CONFLICT (username) DO NOTHING;
    """), {
        "u1": "admin",
        "p1": hash_password("admin123"),
        "u2": "viewer",
        "p2": hash_password("viewer123")
    })
    conn.commit()

print("✅ Default users inserted")