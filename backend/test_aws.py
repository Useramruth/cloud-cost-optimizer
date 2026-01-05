import boto3
from dotenv import load_dotenv
import os

load_dotenv()

ec2 = boto3.client(
    "ec2",
    region_name=os.getenv("AWS_REGION")
)

response = ec2.describe_instances()

print("✅ AWS EC2 connection successful")
print("Number of reservations:", len(response["Reservations"]))
