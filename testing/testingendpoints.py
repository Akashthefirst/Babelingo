import os
from openai import AzureOpenAI
from dotenv import load_dotenv
from pathlib import Path

# Load the .env file from the parent directory
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Now you can access environment variables
api_key = os.getenv("AZURE_API_KEY")
region = os.getenv("AZURE_REGION")
gpt4 = os.getenv("GPT4_ENDPOINT")

print(f"API Key: {api_key}, Region: {region}")  # Debugging check



client = AzureOpenAI(
    api_key= api_key, 
    api_version="2024-10-21",
    azure_endpoint = gpt4,
    )

# from openai import AzureOpenAI
# client = AzureOpenAI()

completion = client.chat.completions.create(
  model="gpt-4o", # Replace with your model dpeloyment name.
  messages=[
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "When was Microsoft founded?"}
  ]
)

#print(completion.choices[0].message)
print(completion.model_dump_json(indent=2))