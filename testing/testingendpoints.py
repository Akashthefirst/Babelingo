import os
from openai import AzureOpenAI
from dotenv import load_dotenv
from pathlib import Path


# Load environment variables from .env file
parent_dir = Path(__file__).resolve().parent.parent

# Load environment variables from .env file in the parent directory
dotenv_path = parent_dir / '.env'
load_dotenv(dotenv_path=dotenv_path)

# Read environment variables
api_key = os.getenv('AZURE_API_KEY')
gpt4 = os.getenv('MODELS_ENDPOINT')
azure_region = os.getenv('AZURE_REGION')


client = AzureOpenAI(
    api_key= api_key, 
    api_version="2025-01-01-preview",
    azure_endpoint = gpt4,
    )

# from openai import AzureOpenAI
# client = AzureOpenAI()

completion = client.chat.completions.create(
  model="gpt-4", # Replace with your model dpeloyment name.
  messages=[
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "When was google founded"}
  ]
)

#print(completion.choices[0].message)
print(completion.model_dump_json(indent=2))