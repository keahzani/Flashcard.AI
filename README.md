# Flashcard.AI 🧠✨

Flashcard.AI is an AI-powered web application that generates smart flashcards from any text input.  
It uses **Flask (Python)** for the backend, **Hugging Face API** for natural language processing, and a modern **frontend** for an interactive user experience.  

---

## 🚀 Features
- Generate study flashcards automatically from text input
- AI-powered question & answer generation (Hugging Face models)
- Simple and intuitive web interface
- Backend built with Flask (Python)
- Ready for deployment on **Render / Vercel / Netlify**

---

## 🛠️ Tech Stack
- **Backend**: Python, Flask, Gunicorn  
- **AI/ML**: Hugging Face Transformers API  
- **Frontend**: HTML, CSS, JavaScript  
- **Deployment**: Render (backend) + optional Vercel/Netlify (frontend)

---

## 📦 Installation (Local Setup)

1. Clone the repository
```bash
git clone https://github.com/keahzani/Flashcard.AI.git
cd Flashcard.AI

2. Create a virtual environment
python -m venv venv
source venv/bin/activate   # (Linux/Mac)
venv\Scripts\activate      # (Windows)

3. Install dependencies
pip install -r requirements.txt

4. Set environment variables
Create a .env file in the root folder and add:
HF_TOKEN=your_huggingface_api_token
FLASK_ENV=development

5. Run the app locally
flask run
