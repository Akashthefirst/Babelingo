
# BABELINGO - A REALTIME VIDEO TRANSCRIPTION AND TRANSLATION APPLICATION

## Team Information

A team of 5 members from IIT Patna:


| Roll No. | Name |
| :-- | :-- |
| 2201AI02 | Akash Sinha |
| 2201AI54 | Aman Vaibhav Jha |
| 2201AI55 | Deep Das |
| 2201CS54 | Prakhar Shukla |
| 2201CS94 | Anirudh D Bhat |

## Problem Statement

The team has chosen MS-AI-14 for this hackathon, which involves developing an AI-based real-time translation solution for video conferencing. This project aims to provide multilingual translations in real-time, leveraging AI-powered speech translation and transcription capabilities to eliminate language barriers in video communications.

## Overview

Babelingo is a sophisticated real-time speech transcription and translation tool that operates seamlessly across multiple platforms. The solution comprises:

- **A Browser Extension**: Compatible with any video content played within a browser environment.
- **A Web Application**: Delivers an intuitive graphical user interface (GUI) for speech transcription and translation.
- **A Terminal Application**: Facilitates speech transcription and translation through a command-line interface.


## Technology Stack

- **UI Frontend**: Vanilla HTML, CSS, JavaScript
- **Terminal UI**: "rich" library
- **Azure Services**:
    - Speech-to-Text
    - Translate
    - Text-to-Speech


## 🚀 Setup Guide

### **1️⃣ Clone the Repository**

```sh
git clone <repository-url>
cd babelingo
```


### **2️⃣ Setup Python Virtual Environment**

For Windows:

```sh
python -m venv venv
venv\Scripts\activate
```

For macOS/Linux:

```sh
python3 -m venv venv
source venv/bin/activate
```


### **3️⃣ Install Required Dependencies**

```sh
pip install -r requirements.txt
```


### **4️⃣ Configure Environment Variables**

Create a `.env` file in the root directory and configure the following parameters:

```
AZURE_API_KEY=your-azure-api-key
AZURE_REGION=your-azure-region
MODELS_ENDPOINT=your-openai-endpoint
COGNITIVE_SERVICES_ENDPOINT=your-azure-cognitive-services-endpoint
TRANSLATOR_TEXT_ENDPOINT=https://api.cognitive.microsofttranslator.com/languages?api-version=3.0
```

Ensure you update the **TRANSLATOR_TEXT_ENDPOINT** to reflect the most current version available.

## 🌐 Browser Extension Setup

### **1️⃣ Load the Extension in Chrome**

1. Launch **Google Chrome**.
2. Navigate to **chrome://extensions/**.
3. Enable **Developer Mode** (toggle in the top-right corner).
4. Select **Load unpacked** and navigate to the `UploadThis` folder within `extensionFiles/`.

### **2️⃣ Using the Extension**

1. Access **YouTube** (or any platform featuring video content).
2. Click the **Babelingo extension** icon in the Chrome toolbar.
3. **Initial Configuration:** You will be directed to settings to enter and save your **Azure API key**.
4. Upon completion of configuration, select **Start Transcription**.
5. **View Transcription \& Translation** as they appear in real-time.
6. Select **Text-to-Speech** to listen to the translated version of the video.

⏳ **Note:** A minimal latency (~1 second) may be experienced depending on network connectivity.

## 🎙️ Terminal-Based Transcription \& Translation

### **Running the Terminal Voice Translation**

```sh
python TerminalVoiceTranslation.py
```

- Allow a **3-second** initialization period before commencing speech.
- Natural **pauses in speech** serve as triggers for the program to process transcription and translation.
- The terminal interface will display both the **original transcription** and its corresponding **translation** in your selected language.


## 🖥️ Web-Based Transcription \& Translation

### **Running the Web Application**

```sh
python WebsiteForVoiceTranslation.py
```

- Access the **URL** presented in the terminal via your preferred web browser.
- Select your desired **source language** and **target translation language**.
- Initiate the process by clicking **Start**.
- Conclude the session by clicking **Stop**.
- Transcriptions are generated in real-time during natural speech pauses.


## 📌 Summary

✅ **Babelingo delivers cross-platform functionality across browsers, web applications, and terminal interfaces.**
✅ **The solution provides comprehensive support for real-time speech transcription and translation.**
✅ **Seamless integration with Azure Cognitive Services and OpenAI ensures optimal performance.**



[^1]: https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/50665142/1b74e224-e775-4bbe-a45d-5ea451fb536d/README.md

[^2]: https://pplx-res.cloudinary.com/image/upload/v1742965387/user_uploads/ttxrSAoAntfBgFi/image.jpg

