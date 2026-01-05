from sqlalchemy import create_engine, text

engine = create_engine(
    "postgresql://cloud_user:cloud123@localhost/cloud_optimizer"
)

with engine.connect() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role VARCHAR(20) NOT NULL,
            email TEXT,
            active BOOLEAN DEFAULT TRUE
        );
    """))
    conn.commit()

print("✅ Users table created")