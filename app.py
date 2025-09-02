from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mysql.connector
import requests
import os
import re
import json
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="frontend", static_url_path="")
CORS(app)  # allows frontend to talk to backend

# --- MySQL Connection ---
def get_db_connection():
    try:
        return mysql.connector.connect(
            host="localhost",
            user="root",              # change if you set another MySQL user
            password="Ronald@2001",   # ✅ your MySQL password
            database="flashcards_db",
            charset='utf8mb4',
            collation='utf8mb4_unicode_ci'
        )
    except mysql.connector.Error as err:
        logger.error(f"Database connection error: {err}")
        raise

# --- Enhanced Hugging Face AI Setup ---
HF_API_TOKEN = os.getenv('HF_API_TOKEN')  # Get API token from environment variable

# Multiple AI models for better flashcard generation
MODELS = {
    "question_generation": "microsoft/DialoGPT-medium",
    "text_analysis": "facebook/bart-large-cnn", 
    "qa_generation": "valhalla/t5-small-qa-qg-hl"
}

headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}

# --- AI Helper Functions ---
def clean_and_split_text(text):
    """Clean and split text into meaningful chunks for processing"""
    # Remove extra whitespace and normalize
    text = re.sub(r'\s+', ' ', text.strip())
    
    # Split by sentences, paragraphs, or logical breaks
    chunks = []
    
    # Split by paragraphs first
    paragraphs = text.split('\n')
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if len(paragraph) > 20:  # Only process substantial paragraphs
            # Split long paragraphs into sentences
            sentences = re.split(r'[.!?]+', paragraph)
            
            current_chunk = ""
            for sentence in sentences:
                sentence = sentence.strip()
                if sentence:
                    if len(current_chunk + sentence) < 200:  # Keep chunks manageable
                        current_chunk += sentence + ". "
                    else:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                        current_chunk = sentence + ". "
            
            if current_chunk:
                chunks.append(current_chunk.strip())
    
    return chunks

def extract_key_concepts(text):
    """Extract key concepts, terms, and facts from text"""
    concepts = []
    
    # Look for definitions (X is Y, X means Y, etc.)
    definition_patterns = [
        r'(\w+(?:\s+\w+)*)\s+(?:is|are|means?|refers?\s+to|defined?\s+as)\s+([^.!?]+)',
        r'(\w+(?:\s+\w+)*):\s*([^.!?]+)',
        r'Definition:\s*(\w+(?:\s+\w+)*)\s*[-–]\s*([^.!?]+)'
    ]
    
    for pattern in definition_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            term = match.group(1).strip()
            definition = match.group(2).strip()
            if len(term) > 2 and len(definition) > 10:
                concepts.append({
                    "type": "definition",
                    "term": term,
                    "content": definition
                })
    
    # Look for numbered lists or bullet points
    list_patterns = [
        r'(?:^|\n)\s*(?:\d+\.|\*|\-|\•)\s*([^.\n]+(?:\.[^.\n]*)*)',
        r'(?:Steps?|Processes?|Stages?):\s*\n((?:\s*(?:\d+\.|\*|\-)\s*[^\n]+\n?)+)'
    ]
    
    for pattern in list_patterns:
        matches = re.finditer(pattern, text, re.MULTILINE | re.IGNORECASE)
        for match in matches:
            item = match.group(1).strip()
            if len(item) > 15:
                concepts.append({
                    "type": "list_item",
                    "content": item
                })
    
    # Look for important facts or statements
    fact_patterns = [
        r'(?:Important|Key|Note|Remember):\s*([^.!?]+)',
        r'(?:According to|Research shows|Studies indicate)\s+([^.!?]+)',
        r'(\w+(?:\s+\w+)*)\s+(?:causes?|results?\s+in|leads?\s+to)\s+([^.!?]+)'
    ]
    
    for pattern in fact_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            if len(match.groups()) == 2:
                fact = f"{match.group(1)} {match.group(2)}"
            else:
                fact = match.group(1)
            
            if len(fact) > 20:
                concepts.append({
                    "type": "fact",
                    "content": fact.strip()
                })
    
    return concepts

def generate_questions_from_concepts(concepts):
    """Generate question-answer pairs from extracted concepts"""
    flashcards = []
    
    for concept in concepts:
        if concept["type"] == "definition":
            # Create definition-based questions
            term = concept["term"]
            definition = concept["content"]
            
            # Multiple question formats for variety
            question_formats = [
                f"What is {term}?",
                f"Define {term}.",
                f"How would you explain {term}?",
                f"What does {term} mean?"
            ]
            
            # Choose the most appropriate format
            question = question_formats[0]  # Default to "What is X?"
            
            flashcards.append({
                "question": question,
                "answer": definition,
                "type": "definition"
            })
            
            # Create reverse question (definition to term)
            if len(definition) < 100:  # Only for shorter definitions
                flashcards.append({
                    "question": f"What term is defined as: '{definition}'?",
                    "answer": term,
                    "type": "reverse_definition"
                })
        
        elif concept["type"] == "fact":
            content = concept["content"]
            
            # Generate fact-based questions
            if "causes" in content.lower() or "results in" in content.lower():
                # Cause-effect questions
                parts = re.split(r'\s+(?:causes?|results?\s+in|leads?\s+to)\s+', content, flags=re.IGNORECASE)
                if len(parts) == 2:
                    flashcards.append({
                        "question": f"What causes {parts[1].strip()}?",
                        "answer": parts[0].strip(),
                        "type": "cause_effect"
                    })
                    flashcards.append({
                        "question": f"What is the result of {parts[0].strip()}?",
                        "answer": parts[1].strip(),
                        "type": "cause_effect"
                    })
            else:
                # General fact questions
                flashcards.append({
                    "question": f"What should you know about this topic?",
                    "answer": content,
                    "type": "fact"
                })
        
        elif concept["type"] == "list_item":
            content = concept["content"]
            
            # Create questions from list items
            flashcards.append({
                "question": "What is one important point to remember?",
                "answer": content,
                "type": "list_item"
            })
    
    return flashcards

def call_huggingface_api(text, model_url, max_retries=3):
    """Make API call to Hugging Face with retry logic"""
    for attempt in range(max_retries):
        try:
            response = requests.post(
                model_url,
                headers=headers,
                json={"inputs": text[:1000]},  # Limit input length
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 503:
                logger.warning(f"Model loading, attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(2 ** attempt)  # Exponential backoff
                continue
            else:
                logger.error(f"API error: {response.status_code} - {response.text}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error on attempt {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                return None
    
    return None

def enhance_flashcards_with_ai(text_chunks):
    """Use AI to enhance and generate better flashcards"""
    enhanced_cards = []
    
    # Try to use AI for question generation
    qa_model_url = f"https://api-inference.huggingface.co/models/{MODELS['qa_generation']}"
    
    for chunk in text_chunks[:5]:  # Limit to prevent overload
        # Try AI-enhanced question generation
        ai_response = call_huggingface_api(chunk, qa_model_url)
        
        if ai_response and isinstance(ai_response, list):
            for item in ai_response:
                if isinstance(item, dict) and "generated_text" in item:
                    generated = item["generated_text"]
                    
                    # Parse AI-generated Q&A if formatted correctly
                    if "Question:" in generated and "Answer:" in generated:
                        parts = generated.split("Answer:")
                        if len(parts) == 2:
                            question = parts[0].replace("Question:", "").strip()
                            answer = parts[1].strip()
                            
                            enhanced_cards.append({
                                "question": question,
                                "answer": answer,
                                "type": "ai_generated"
                            })
    
    return enhanced_cards

def create_comprehensive_flashcards(text):
    """Main function to create comprehensive flashcards from text"""
    flashcards = []
    
    # Step 1: Clean and prepare text
    text_chunks = clean_and_split_text(text)
    
    if not text_chunks:
        return [{
            "question": "Unable to process the provided text",
            "answer": "Please provide more structured content with clear concepts, definitions, or facts."
        }]
    
    # Step 2: Extract concepts using rule-based approach
    concepts = extract_key_concepts(text)
    rule_based_cards = generate_questions_from_concepts(concepts)
    flashcards.extend(rule_based_cards)
    
    # Step 3: Try to enhance with AI (if available)
    try:
        ai_cards = enhance_flashcards_with_ai(text_chunks[:3])  # Limit for performance
        flashcards.extend(ai_cards)
    except Exception as e:
        logger.warning(f"AI enhancement failed: {e}")
    
    # Step 4: Create fallback flashcards if nothing was extracted
    if not flashcards:
        # Create basic comprehension questions
        for i, chunk in enumerate(text_chunks[:5]):
            if len(chunk) > 50:
                flashcards.append({
                    "question": f"What are the key points in section {i + 1}?",
                    "answer": chunk,
                    "type": "comprehension"
                })
        
        # Create summary question
        if len(text) > 100:
            try:
                # Try to get AI summary
                summary_url = f"https://api-inference.huggingface.co/models/{MODELS['text_analysis']}"
                summary_response = call_huggingface_api(text[:800], summary_url)
                
                if summary_response and isinstance(summary_response, list) and "summary_text" in summary_response[0]:
                    summary = summary_response[0]["summary_text"]
                    flashcards.append({
                        "question": "Summarize the main points of this content.",
                        "answer": summary,
                        "type": "summary"
                    })
                else:
                    # Fallback summary
                    first_sentences = '. '.join(text[:300].split('. ')[:2])
                    flashcards.append({
                        "question": "What is this content mainly about?",
                        "answer": first_sentences + "...",
                        "type": "summary"
                    })
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")
    
    # Step 5: Remove duplicates and improve quality
    flashcards = remove_duplicate_flashcards(flashcards)
    flashcards = improve_flashcard_quality(flashcards)
    
    # Limit to reasonable number
    return flashcards[:15]  # Max 15 cards per session

def remove_duplicate_flashcards(flashcards):
    """Remove duplicate or very similar flashcards"""
    unique_cards = []
    seen_questions = set()
    
    for card in flashcards:
        question_normalized = re.sub(r'[^\w\s]', '', card["question"].lower())
        
        if question_normalized not in seen_questions:
            seen_questions.add(question_normalized)
            unique_cards.append(card)
    
    return unique_cards

def improve_flashcard_quality(flashcards):
    """Improve the quality and format of flashcards"""
    improved_cards = []
    
    for card in flashcards:
        question = card["question"].strip()
        answer = card["answer"].strip()
        
        # Skip low-quality cards
        if len(question) < 10 or len(answer) < 10:
            continue
        
        # Improve question formatting
        if not question.endswith('?'):
            question += '?'
        
        # Capitalize first letter
        question = question[0].upper() + question[1:] if question else question
        answer = answer[0].upper() + answer[1:] if answer else answer
        
        # Clean up answer
        answer = re.sub(r'^(Answer:|A:)\s*', '', answer, flags=re.IGNORECASE)
        answer = re.sub(r'\s+', ' ', answer)
        
        # Limit answer length for better readability
        if len(answer) > 200:
            sentences = answer.split('. ')
            answer = '. '.join(sentences[:2])
            if not answer.endswith('.'):
                answer += '.'
        
        improved_cards.append({
            "question": question,
            "answer": answer,
            "type": card.get("type", "general")
        })
    
    return improved_cards

def create_fallback_flashcards(text):
    """Create basic flashcards when AI processing fails"""
    flashcards = []
    
    # Split text into logical sections
    sections = text.split('\n\n')
    
    for i, section in enumerate(sections[:5]):
        section = section.strip()
        if len(section) > 50:
            # Create a simple comprehension question
            flashcards.append({
                "question": f"What does section {i + 1} discuss?",
                "answer": section[:150] + "..." if len(section) > 150 else section,
                "type": "comprehension"
            })
    
    # Add a general summary question
    if len(text) > 100:
        first_part = text[:200].strip()
        flashcards.append({
            "question": "What is the main topic of this content?",
            "answer": first_part + "..." if len(text) > 200 else first_part,
            "type": "overview"
        })
    
    return flashcards

# --- Enhanced Routes ---
@app.route("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.route('/get_flashcards', methods=['GET'])
def get_flashcards():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, question, answer, created_at FROM flashcards ORDER BY created_at DESC")
        flashcards = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Convert datetime to string for JSON serialization
        for card in flashcards:
            if 'created_at' in card and card['created_at']:
                card['created_at'] = card['created_at'].isoformat()
        
        logger.info(f"Retrieved {len(flashcards)} flashcards from database")
        return jsonify(flashcards)
        
    except Exception as e:
        logger.error(f"Error retrieving flashcards: {e}")
        return jsonify({"error": "Failed to retrieve flashcards"}), 500

@app.route('/save_flashcard', methods=['POST'])
def save_flashcard():
    try:
        data = request.json
        question = data.get("question", "").strip()
        answer = data.get("answer", "").strip()

        if not question or not answer:
            return jsonify({"error": "Question and answer are required"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check for duplicates
        cursor.execute("SELECT COUNT(*) FROM flashcards WHERE question = %s", (question,))
        if cursor.fetchone()[0] > 0:
            cursor.close()
            conn.close()
            return jsonify({"message": "This flashcard already exists!"}), 200
        
        # Insert new flashcard
        cursor.execute(
            "INSERT INTO flashcards (question, answer, created_at) VALUES (%s, %s, %s)", 
            (question, answer, datetime.now())
        )
        conn.commit()
        cursor.close()
        conn.close()

        logger.info(f"Saved flashcard: {question[:50]}...")
        return jsonify({"message": "Flashcard saved successfully!"})
        
    except Exception as e:
        logger.error(f"Error saving flashcard: {e}")
        return jsonify({"error": "Failed to save flashcard"}), 500

@app.route("/generate_flashcards", methods=["POST"])
def generate_flashcards():
    try:
        data = request.get_json()
        
        # Handle both 'text' and 'notes' keys for compatibility
        text = data.get("notes") or data.get("text", "")
        
        if not text or len(text.strip()) < 20:
            return jsonify({"error": "Please provide more substantial content to generate flashcards"}), 400

        logger.info(f"Generating flashcards for {len(text)} characters of text")
        
        # Step 1: Create comprehensive flashcards
        flashcards = create_comprehensive_flashcards(text)
        
        # Step 2: If we have very few cards, try AI enhancement
        if len(flashcards) < 3:
            try:
                logger.info("Attempting AI-enhanced generation...")
                
                # Try different AI approaches
                ai_models_to_try = [
                    {
                        "url": f"https://api-inference.huggingface.co/models/google/flan-t5-base",
                        "prompt": f"Generate 5 study questions and answers from this text: {text[:500]}"
                    },
                    {
                        "url": f"https://api-inference.huggingface.co/models/{MODELS['text_analysis']}",
                        "prompt": text[:800]
                    }
                ]
                
                for model_config in ai_models_to_try:
                    ai_response = call_huggingface_api(model_config["prompt"], model_config["url"])
                    
                    if ai_response:
                        ai_cards = parse_ai_response(ai_response, text)
                        if ai_cards:
                            flashcards.extend(ai_cards)
                            break
                            
            except Exception as e:
                logger.warning(f"AI enhancement failed: {e}")
        
        # Step 3: Final fallback if still no good cards
        if len(flashcards) < 2:
            logger.info("Using fallback flashcard generation")
            flashcards = create_fallback_flashcards(text)
        
        # Step 4: Final processing
        flashcards = flashcards[:12]  # Limit to 12 cards
        
        if not flashcards:
            return jsonify([{
                "question": "Unable to generate flashcards from this content",
                "answer": "Please try providing more structured text with clear concepts, definitions, or key facts."
            }])
        
        logger.info(f"Successfully generated {len(flashcards)} flashcards")
        return jsonify(flashcards)
        
    except Exception as e:
        logger.error(f"Error in generate_flashcards: {e}")
        return jsonify({"error": "An error occurred while generating flashcards"}), 500

def parse_ai_response(ai_response, original_text):
    """Parse AI response to extract question-answer pairs"""
    cards = []
    
    try:
        if isinstance(ai_response, list) and len(ai_response) > 0:
            result = ai_response[0]
            
            if "generated_text" in result:
                generated = result["generated_text"]
                
                # Try to parse structured Q&A format
                qa_patterns = [
                    r'(?:Question|Q):\s*([^?\n]+\?)\s*(?:Answer|A):\s*([^\n]+)',
                    r'(\d+\.\s*[^?\n]+\?)\s*([^\d\n]+?)(?=\d+\.|$)',
                    r'([^?\n]+\?)\s*([^\?\n]+?)(?=[^?\n]+\?|$)'
                ]
                
                for pattern in qa_patterns:
                    matches = re.finditer(pattern, generated, re.MULTILINE | re.IGNORECASE)
                    for match in matches:
                        question = match.group(1).strip()
                        answer = match.group(2).strip()
                        
                        if len(question) > 10 and len(answer) > 10:
                            cards.append({
                                "question": question,
                                "answer": answer,
                                "type": "ai_generated"
                            })
            
            elif "summary_text" in result:
                # Use summary to create a flashcard
                summary = result["summary_text"]
                cards.append({
                    "question": "What is the main summary of this content?",
                    "answer": summary,
                    "type": "ai_summary"
                })
    
    except Exception as e:
        logger.warning(f"Error parsing AI response: {e}")
    
    return cards

# --- Additional Routes for Enhanced Functionality ---
@app.route('/delete_flashcard/<int:card_id>', methods=['DELETE'])
def delete_flashcard(card_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM flashcards WHERE id = %s", (card_id,))
        conn.commit()
        
        if cursor.rowcount > 0:
            cursor.close()
            conn.close()
            return jsonify({"message": "Flashcard deleted successfully!"})
        else:
            cursor.close()
            conn.close()
            return jsonify({"error": "Flashcard not found"}), 404
            
    except Exception as e:
        logger.error(f"Error deleting flashcard: {e}")
        return jsonify({"error": "Failed to delete flashcard"}), 500

@app.route('/clear_all_flashcards', methods=['DELETE'])
def clear_all_flashcards():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM flashcards")
        conn.commit()
        deleted_count = cursor.rowcount
        cursor.close()
        conn.close()
        
        return jsonify({"message": f"Deleted {deleted_count} flashcards successfully!"})
        
    except Exception as e:
        logger.error(f"Error clearing flashcards: {e}")
        return jsonify({"error": "Failed to clear flashcards"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

# --- Error Handlers ---
@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    # Ensure database table exists
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS flashcards (
                id INT AUTO_INCREMENT PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        conn.commit()
        cursor.close()
        conn.close()
        logger.info("Database table verified/created successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
    
    app.run(debug=True, host='0.0.0.0', port=5000)