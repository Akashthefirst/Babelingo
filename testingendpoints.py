import os
from openai import AzureOpenAI



client = AzureOpenAI(
    api_key="Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg" ,  
    api_version="2024-10-21",
    azure_endpoint = "https://ai-aihackthonhub282549186415.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview"
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