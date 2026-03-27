from io import BytesIO

from gtts import gTTS


def synthesize_tts_mp3(text: str, lang: str = "en", tld: str = "com") -> bytes:
    content = text.strip()
    if not content:
        content = "Please answer the question clearly."

    buffer = BytesIO()
    tts = gTTS(text=content, lang=lang, tld=tld, slow=False)
    tts.write_to_fp(buffer)
    return buffer.getvalue()
