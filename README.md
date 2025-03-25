# BABELINGO - A REALTIME VIDEO TRANSCRIPTION AND TRANSLATION APPLICATION

Babelingo is a powerful real-time speech transcription and translation tool that operates across multiple platforms. It consists of:

- **A Browser Extension**: Works on any video played in a browser.
- **A Web Application**: Provides a graphical user interface (GUI) for speech transcription and translation.
- **A Terminal Application**: Enables speech transcription and translation via command-line interface.

---

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

Create a `.env` file in the root directory and add the following details:

```
AZURE_API_KEY=your-azure-api-key
AZURE_REGION=your-azure-region
MODELS_ENDPOINT=your-openai-endpoint
COGNITIVE_SERVICES_ENDPOINT=your-azure-cognitive-services-endpoint
TRANSLATOR_TEXT_ENDPOINT=https://api.cognitive.microsofttranslator.com/languages?api-version=3.0
```

Ensure you update the **TRANSLATOR\_TEXT\_ENDPOINT** to the latest version at the time of usage.

---

## 🌐 Browser Extension Setup

### **1️⃣ Load the Extension in Chrome**

1. Open **Google Chrome**.
2. Navigate to **chrome://extensions/**.
3. Enable **Developer Mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `UploadThis` folder inside `extensionFiles/`.

### **2️⃣ Using the Extension**

1. Open **YouTube** (or any site with a video).
2. Click on the **Babelingo extension** icon in the Chrome toolbar.
3. **First-Time Setup:** You will be redirected to settings to enter and save your **Azure API key**.
4. Once configured, click **Start Transcription**.
5. **See Transcription & Translation** in real-time!
6. Click **Text-to-Speech** to hear the translated version of the video.

⏳ **Note:** There may be a small delay (\~1 second) depending on internet speed.

---

## 🎙️ Terminal-Based Transcription & Translation

### **Running the Terminal Voice Translation**

```sh
python TerminalVoiceTranslation.py
```

- Wait **3 seconds**, then start speaking.
- A **pause in speech** acts as a cue for the program to transcribe and translate.
- The terminal will display both the **transcription** and its **translation** in your chosen language.

---

## 🖥️ Web-Based Transcription & Translation

### **Running the Web Application**

```sh
python WebsiteForVoiceTranslation.py
```

- Open the **URL** displayed in the terminal in your web browser.
- Select the **input language** and **target translation language**.
- Click **Start** to begin transcription.
- Click **Stop** when done.
- The transcription appears in real-time when you pause.

---

## 📌 Summary

✅ **Babelingo works across browsers, web apps, and the terminal.**\
✅ **Supports real-time speech transcription and translation.**\
✅ **Integrates seamlessly with Azure Cognitive Services and OpenAI.**

🔗 **Try it now and experience real-time AI-powered translation!** 🚀



