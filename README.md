BABELINGO- A REALTIME VIDEO TRANSCRIPTION AND TRANSLATION APPLICATION


This repository has 3 components
1)A browser extension that can be used for any video played on the browser
2)A Website for speech transcription and translation 
3)A terminal based speech transcription and translation

Step by step guide to setup the project:-
1)Clone the repository
2)Create a python virtual environment , for windows its as follows


3) Install all the requirements using pip install -r requirements
4) Create the .env file and set the following
AZURE_API_KEY - Your azure api key
AZURE_REGION - Region of your azure api
MODELS_ENDPOINT= Openai endpoint for your azure service
COGNTITIVE_SERVICES_ENDPOINT- Cognitive services endpoint in your azure services
TRANSLATOR_TEXT_ENDPOINT="https://api.cognitive.microsofttranslator.com/languages?api-version=3.0" or the latest version of the translator endpoint at the time of usage

5) To make use of the terminal voice transcription and translation service , run python TerminalVoiceTranslation.py, wait for 3 seconds following which you can start speaking, everytime you give a pause its a cue to the program and it will display the transcript along with its translation in the language chosen
6) To use the website which is the GUI version of the terminal feature, run WebsiteForVoiceTranslation.py and copy the url displayed onto your web browser(or ctrl+lclick) and choose the language as per need. Start and stop transcription do as described and transcription happens when you give a pause.

7)The most important part for making extension
Go to chrome, extensions, enable developer mode and click on upload extension unpacked. Click on the extensionFiles folder and upload the Extension(UploadThis) folder
With this the extension is uploaded
8) To test it go to youtube, start any video, click on the extension in the extensions icon beside the url bar and choose Babelingo. Initially you wouldnt have given an api key hence it redirects you to the settings where you have to enter your api key and save it. Following which you can start transcription in the video tab.
You will see both the transcript along with translation to the language you have chosen. Click on text to speech and you will also get to hear to the translated version of the video. There is a small delay of approximately 1second which might get exxagerated if the internet speed is slow