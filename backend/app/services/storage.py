"""Storage service — S3 compatible object storage (MinIO)."""

import uuid
from typing import BinaryIO

import boto3
from botocore.config import Config

from app.config import get_settings

settings = get_settings()

def get_s3_client():
    """Create a new boto3 S3 client using configured settings."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
        # Required for MinIO
        region_name="us-east-1",
    )

def ensure_bucket_exists(client) -> None:
    """Ensure the target S3 bucket exists, create if it doesn't."""
    try:
        client.head_bucket(Bucket=settings.s3_bucket_name)
    except Exception:
        # Bucket does not exist or we don't have permission
        try:
            client.create_bucket(Bucket=settings.s3_bucket_name)
            # Make bucket private by default
            client.put_bucket_acl(Bucket=settings.s3_bucket_name, ACL="private")
        except Exception as e:
            print(f"[VAI] Warning: Failed to create S3 bucket {settings.s3_bucket_name}: {e}")


def upload_screenshot(file_obj: BinaryIO, install_id: str) -> str:
    """Upload a screenshot to S3.
    
    Args:
        file_obj: The binary file object (e.g. from FastAPI UploadFile).
        install_id: The install ID for grouping files.
        
    Returns:
        The S3 object key (path).
    """
    client = get_s3_client()
    ensure_bucket_exists(client)
    
    file_id = str(uuid.uuid4())
    key = f"screenshots/{install_id}/{file_id}.jpg"
    
    # Upload
    client.upload_fileobj(
        file_obj,
        settings.s3_bucket_name,
        key,
        ExtraArgs={"ContentType": "image/jpeg"}
    )
    
    return key


def get_screenshot_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for secure access to a screenshot.
    
    Args:
        key: The S3 object key.
        expires_in: Expiration time in seconds (default 1 hour).
        
    Returns:
        The presigned URL string.
    """
    client = get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": key},
        ExpiresIn=expires_in,
    )
    return url


def get_screenshot_bytes(key: str) -> bytes:
    """Retrieve the raw bytes of a screenshot (for AI processing)."""
    client = get_s3_client()
    response = client.get_object(Bucket=settings.s3_bucket_name, Key=key)
    return response["Body"].read()


def delete_screenshot(key: str) -> None:
    """Delete a screenshot from S3."""
    client = get_s3_client()
    client.delete_object(Bucket=settings.s3_bucket_name, Key=key)
