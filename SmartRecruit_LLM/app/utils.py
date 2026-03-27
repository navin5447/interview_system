import os
from werkzeug.utils import secure_filename
from flask import current_app
import re
import requests
import json
import time
import logging
import pdfplumber  # type: ignore
try:
    from sentence_transformers import SentenceTransformer, util  # type: ignore
except Exception:
    SentenceTransformer = None
    util = None

# Lazy-initialize the sentence transformer model so app startup and DB setup
# do not block on model download.
model = None
logging.basicConfig(level=logging.INFO)

def get_sentence_model():
    """Returns a cached sentence transformer model instance."""
    global model
    if SentenceTransformer is None:
        return None
    if model is None:
        model = SentenceTransformer('multi-qa-mpnet-base-dot-v1')
    return model

def create_upload_folders(app):
    """
    Creates the necessary upload folders for CVs and profile photos.
    If the folders already exist, it does nothing.

    Args:
        app (Flask): The Flask application instance.
    """
    os.makedirs(app.config['UPLOAD_FOLDER_CV'], exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_PHOTOS'], exist_ok=True)

def allowed_file(filename, allowed_extensions):
    """
    Checks if a given filename has an allowed extension.

    Args:
        filename (str): The name of the file to check.
        allowed_extensions (set): A set of allowed file extensions.

    Returns:
        bool: True if the file has an allowed extension, False otherwise.
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def preprocess_text(text):
    """
    Preprocesses the input text by removing unwanted characters and normalizing spaces.

    Args:
        text (str): The text to preprocess.

    Returns:
        str: The cleaned and normalized text.
    """
    text = re.sub(r'\s+', ' ', text)  
    text = re.sub(r'[^\w\s]', '', text)  
    return text

def compute_similarity(cv_text, job_description):
    """
    Computes the cosine similarity between the CV text and job description.

    Args:
        cv_text (str): The text from the candidate's CV.
        job_description (str): The text from the job description.

    Returns:
        float: The cosine similarity score between the CV and job description.
    """
    cv_text = preprocess_text(cv_text)
    job_description = preprocess_text(job_description)

    sentence_model = get_sentence_model()
    if sentence_model is not None and util is not None:
        embeddings_cv = sentence_model.encode(cv_text, convert_to_tensor=True)
        embeddings_job_desc = sentence_model.encode(job_description, convert_to_tensor=True)
        similarity_score = util.cos_sim(embeddings_cv, embeddings_job_desc)
        return float(similarity_score.item())

    cv_tokens = {token for token in cv_text.lower().split() if token}
    job_tokens = {token for token in job_description.lower().split() if token}
    if not cv_tokens or not job_tokens:
        return 0.0

    overlap = len(cv_tokens.intersection(job_tokens))
    total = len(cv_tokens.union(job_tokens))
    return float(overlap / total) if total else 0.0

def evaluate_cv(cv_text, job_description, threshold = 0.5):
    """
    Evaluates the CV against the job description using the similarity score.

    Args:
        cv_text (str): The text from the candidate's CV.
        job_description (str): The text from the job description.
        threshold (float): The similarity threshold to determine a match.

    Returns:
        bool: True if the similarity score is above the threshold, False otherwise.
    """
    similarity = compute_similarity(cv_text, job_description)
    logging.info(f"Similarity score: {similarity:.2f}")

    return similarity > threshold, similarity

def generate_interview_questions(cv_text, job_description, max_retries=10):
    """
    Generates personalized interview questions based on the candidate's CV and the job description.

    Args:
        cv_text (str): The text from the candidate's CV.
        job_description (str): The text from the job description.
        max_retries (int): The maximum number of retries if the API call fails.

    Returns:
        list: A list of generated interview questions or an error message.
    """
    prompt = f"""Below is an instruction that describes a task, paired with an input that provides further context. Write a response that appropriately completes the request.

### Instruction:
Generate 10 personalized interview questions based on the candidate's experience and the job description provided. Don't add anything else, just give the 10 questions and don't repeat questions.

### Input:
Candidate's Resume:
{cv_text}

Job Description:
{job_description}

### Response:
"""
    data = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 1000,
            "temperature": 0.6,
            "top_p": 0.9,
            "do_sample": True
        }
    }

    headers = {
        "Authorization": f"Bearer {current_app.config['API_TOKEN']}",
        "Content-Type": "application/json"
    }

    for attempt in range(max_retries):
        try:
            response = requests.post(current_app.config['API_URL'], headers=headers, data=json.dumps(data))
            response.raise_for_status()
            result = response.json()
            logging.debug("API Response: %s", result)

            # Extract questions from the generated text
            generated_text = result[0].get('generated_text', '')
            questions = [line.strip() for line in generated_text.split("\n") if line.strip().endswith('?')]
            logging.debug("Generated Questions: %s", questions)

            # Ensure exactly 10 questions are returned
            if len(questions) == 10:
                return questions
            else:
                logging.warning("Generated questions count is not 10. Attempt %d.", attempt + 1)

        except (requests.exceptions.HTTPError, requests.exceptions.RequestException) as e:
            # Exponential backoff for retries
            wait_time = (2 ** attempt) + (0.1 * attempt)
            logging.warning(f"Attempt {attempt + 1} failed. Retrying in {wait_time:.2f} seconds... Error: {e}")
            time.sleep(wait_time)
        except Exception as e:
            logging.error(f"Unexpected error occurred: {e}")
            break

    return ["Error: Could not generate questions after multiple attempts."]

def generate_feedback(question_text, response_text, job_description, max_retries=10):
    """
    Generates feedback based on the candidate's response to an interview question, the question itself, and the job description, and generates a score out of 10 at the end.

    Args:
        question_text (str): The interview question asked to the candidate.
        response_text (str): The candidate's response to the interview question.
        job_description (str): The text from the job description.
        max_retries (int): The maximum number of retries if the API call fails.

    Returns:
        str: The generated feedback or an error message.
    """
    prompt = f"""Below is an interview question, the candidate's response, and the job description. Provide concise , short and constructive feedback on the candidate's response, considering the job requirements and the context of the question. Make sure to include a score out of 10 at the end of the feedback. The score should always be formatted as 'Score: X/10'.

    ### Example:
    Feedback: The candidate provided a well-thought-out response, addressing the key requirements of the job description effectively. However, they could improve on their technical knowledge. Score: 7/10

    ### Interview Question:
    {question_text}

    ### Candidate's Response:
    {response_text}

    ### Job Description:
    {job_description}

    ### Feedback:
    """

    data = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 500,
            "temperature": 0.6,
            "top_p": 0.9,
            "do_sample": True
        }
    }

    headers = {
        "Authorization": f"Bearer {current_app.config['API_TOKEN']}",
        "Content-Type": "application/json"
    }

    for attempt in range(max_retries):
        try:
            response = requests.post(current_app.config['API_URL'], headers=headers, data=json.dumps(data))
            response.raise_for_status()
            result = response.json()
            logging.debug("API Feedback Response: %s", result)

            # Extract feedback from the generated text
            generated_text = result[0].get('generated_text', '')
            feedback_start = generated_text.find("### Feedback:") + len("### Feedback:")
            feedback = generated_text[feedback_start:].strip()
            logging.debug("Extracted Feedback: %s", feedback)

            return feedback

        except (requests.exceptions.HTTPError, requests.exceptions.RequestException) as e:
            # Exponential backoff for retries
            wait_time = (2 ** attempt) + (0.1 * attempt)
            logging.warning(f"Attempt {attempt + 1} failed. Retrying in {wait_time:.2f} seconds... Error: {e}")
            time.sleep(wait_time)
        except Exception as e:
            logging.error(f"Unexpected error occurred: {e}")
            break

    return "Error: Could not generate feedback after multiple attempts."

def convert_keys_to_strings(data):
    """
    Recursively converts all dictionary keys to strings.

    Args:
        data (dict or list): The input dictionary or list to process.

    Returns:
        dict or list: The processed data with all keys converted to strings.
    """
    if isinstance(data, dict):
        return {str(k): convert_keys_to_strings(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_keys_to_strings(i) for i in data]
    else:
        return data

def extract_score(feedback):
    """
    Extracts the score from the feedback text using multiple patterns.

    Args:
        feedback (str): The feedback text containing the score.

    Returns:
        int: The extracted score or None if no score was found.
    """
    patterns = [
        r'\b(\d{1,2})\s*/\s*10\b',                # Matches "3/10", "3 / 10", etc.
        r'\b(\d{1,2})\s*out\s+of\s+10\b',         # Matches "3 out of 10", etc.
        r'\b(\d{1,2})\s*over\s*10\b',             # Matches "3 over 10", etc.
        r'\bscore\s+is\s+(\d{1,2})\b',            # Matches "score is 10", "score is 3", etc.
        r'\brated\s+(\d{1,2})\s*/\s*10\b',        # Matches "rated 7/10", etc.
        r'\brating\s+of\s+(\d{1,2})\s*/\s*10\b',  # Matches "rating of 8/10", etc.
        r'\bgave\s+it\s+a\s+(\d{1,2})\b',         # Matches "gave it a 5", etc.
        r'\b(\d{1,2})\b\s+(?:points|stars)\s*/\s*10\b' # Matches "5 points / 10", "5 stars / 10", etc.
    ]

    for pattern in patterns:
        match = re.search(pattern, feedback, re.IGNORECASE)
        if match:
            return int(match.group(1))

    logging.warning("No score found in feedback.")
    return None

def parse_job_description_pdf(file_stream) -> dict:
    """
    Parses a PDF file stream and extracts structured job data based on predefined sections.

    Args:
        file_stream: A file-like object representing the PDF.

    Returns:
        A dictionary containing the extracted job data.
    """
    extracted_data = {}

    def extract_first_group(pattern: str, text: str, flags: int = re.IGNORECASE) -> str:
        match = re.search(pattern, text, flags)
        if not match:
            return ""
        return (match.group(1) or "").strip()

    with pdfplumber.open(file_stream) as pdf:
        full_text = ""
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

    # Define regex for each section
    sections = {
        "job_basics": r"JOB BASICS\n([\s\S]*?)(?=\nQUALIFICATIONS|\Z)",
        "qualifications": r"QUALIFICATIONS\n([\s\S]*?)(?=\nSHORTLISTING CRITERIA|\Z)",
        "shortlisting": r"SHORTLISTING CRITERIA\n([\s\S]*?)(?=\nINTERVIEW ROUNDS|\Z)",
        "interview_rounds": r"INTERVIEW ROUNDS\n([\s\S]*?)(?=\nNOTIFICATION PREFERENCES|\Z)",
        "notifications": r"NOTIFICATION PREFERENCES\n([\s\S]*?)(?=\Z)",
    }

    # --- Helper for list extraction ---
    def extract_list_items(text, key):
        match = re.search(rf"{key}:\n((?:- .+\n?)+)", text, re.IGNORECASE)
        if match:
            return [item.strip('- ').strip() for item in match.group(1).strip().split('\n') if item.strip()]
        return []

    # --- 1. Job Basics ---
    job_basics_text = re.search(sections["job_basics"], full_text, re.IGNORECASE)
    if job_basics_text:
        basics_content = job_basics_text.group(1)
        extracted_data["job_title"] = extract_first_group(r"Job Title:\s*(.*)", basics_content)
        extracted_data["department"] = extract_first_group(r"Department:\s*(.*)", basics_content)
        extracted_data["employment_type"] = extract_first_group(r"Employment Type:\s*(.*)", basics_content)
        extracted_data["work_mode"] = extract_first_group(r"Work Mode:\s*(.*)", basics_content)
        extracted_data["location"] = extract_first_group(r"Location:\s*(.*)", basics_content)
        extracted_data["salary"] = extract_first_group(r"Salary:\s*(.*)", basics_content)
        extracted_data["application_deadline"] = extract_first_group(r"Application Deadline:\s*(.*)", basics_content)
        
        desc_match = re.search(r"Job Description:\n([\s\S]*?)(?=\nRole Summary:|\Z)", basics_content)
        extracted_data["job_description"] = desc_match.group(1).strip() if desc_match else ""
        
        summary_match = re.search(r"Role Summary:\n([\s\S]*)", basics_content)
        extracted_data["role_summary"] = summary_match.group(1).strip() if summary_match else ""

    # --- 2. Qualifications ---
    qualifications_text = re.search(sections["qualifications"], full_text, re.IGNORECASE)
    if qualifications_text:
        qual_content = qualifications_text.group(1)
        extracted_data["key_responsibilities"] = extract_list_items(qual_content, "Key Responsibilities")
        extracted_data["required_qualifications"] = extract_list_items(qual_content, "Required Qualifications")
        extracted_data["preferred_qualifications"] = extract_list_items(qual_content, "Preferred Qualifications")
        extracted_data["tech_stack"] = extract_list_items(qual_content, "Tech Stack / Tools")

    # --- 3. Shortlisting Criteria ---
    shortlisting_text = re.search(sections["shortlisting"], full_text, re.IGNORECASE)
    if shortlisting_text:
        shortlist_content = shortlisting_text.group(1)
        extracted_data["expected_applicants"] = extract_first_group(r"Expected Applicants:\s*(.*)", shortlist_content)
        extracted_data["shortlist_mode"] = extract_first_group(r"Shortlist Mode:\s*(.*)", shortlist_content)
        extracted_data["shortlist_value"] = extract_first_group(r"Shortlist Value:\s*(.*)", shortlist_content)
        extracted_data["min_ats_threshold"] = extract_first_group(r"Minimum ATS Threshold:\s*(.*)", shortlist_content)
        extracted_data["mandatory_filters"] = extract_list_items(shortlist_content, "Mandatory Filters")
        extracted_data["preferred_filters"] = extract_list_items(shortlist_content, "Preferred Filters")

    # --- 4. Interview Rounds ---
    interview_rounds_text = re.search(sections["interview_rounds"], full_text, re.IGNORECASE)
    if interview_rounds_text:
        rounds_content = interview_rounds_text.group(1)
        round_blocks = re.split(r"Round \d+:", rounds_content)[1:]
        extracted_data["interview_rounds"] = []
        for i, block in enumerate(round_blocks, 1):
            round_data = {"round_number": i}
            round_data["round_name"] = extract_first_group(r"Round Name:\s*(.*)", block)
            round_data["round_type"] = extract_first_group(r"Round Type:\s*(.*)", block)
            round_data["duration"] = extract_first_group(r"Duration:\s*(.*)", block)
            round_data["advance_count"] = extract_first_group(r"Advance Count:\s*(.*)", block)
            round_data["schedule_window"] = extract_first_group(r"Schedule:\s*(.*)", block)
            round_data["topics"] = extract_list_items(block, "Topics")
            round_data["evaluation_rubric"] = extract_list_items(block, "Evaluation Rubric")
            extracted_data["interview_rounds"].append(round_data)

    # --- 5. Notification Preferences ---
    notifications_text = re.search(sections["notifications"], full_text, re.IGNORECASE)
    if notifications_text:
        notif_content = notifications_text.group(1)
        extracted_data["email_tone"] = extract_first_group(r"Email Tone:\s*(.*)", notif_content)
        extracted_data["send_rejection_emails"] = extract_first_group(r"Send Rejection Emails:\s*(.*)", notif_content)
        extracted_data["company_name"] = extract_first_group(r"Company Name:\s*(.*)", notif_content)
        extracted_data["reply_to_email"] = extract_first_group(r"Reply-To Email:\s*(.*)", notif_content)
        extracted_data["company_logo_url"] = extract_first_group(r"Company Logo URL:\s*(.*)", notif_content)

    return extracted_data
