# -*- coding: utf-8 -*-

# This script detects the language of the given text using Azure Translator API.

import os
import requests
import uuid
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Retrieve API credentials from environment variables
resource_key = os.getenv("TRANSLATOR_TEXT_RESOURCE_KEY")
region = os.getenv("TRANSLATOR_TEXT_REGION")
endpoint = os.getenv("TRANSLATOR_TEXT_ENDPOINT")

# Ensure required variables are set
if not resource_key or not region or not endpoint:
    raise Exception("Missing environment variables! Check your .env file.")

# API path for language detection
path = "/detect?api-version=3.0"
constructed_url = endpoint + path

# Request headers
headers = {
    "Ocp-Apim-Subscription-Key": resource_key,
    "Ocp-Apim-Subscription-Region": region,
    "Content-type": "application/json",
    "X-ClientTraceId": str(uuid.uuid4()),
}

# Input text for detection
body = [{"text": "Salve, mondo!"}]

# Make API request
response = requests.post(constructed_url, headers=headers, json=body)

# Print formatted response
print(json.dumps(response.json(), indent=4, ensure_ascii=False))
