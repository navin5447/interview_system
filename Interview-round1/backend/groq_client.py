"""
Groq API Client Wrapper
Handles all interactions with the Groq LLM API
"""

import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


class GroqClient:
    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not found in environment variables")
        self.client = Groq(api_key=api_key)
        self.model = "llama-3.3-70b-versatile"

    def generate_response(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """
        Generate a response from the Groq LLM

        Args:
            system_prompt: The system context/instructions
            user_prompt: The user's input/question
            temperature: Controls randomness (0.0 - 1.0)

        Returns:
            The generated text response
        """
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=temperature,
                max_tokens=4096
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"Groq API error: {str(e)}")


# Singleton instance
_client = None

def get_groq_client() -> GroqClient:
    """Get or create the Groq client singleton"""
    global _client
    if _client is None:
        _client = GroqClient()
    return _client
