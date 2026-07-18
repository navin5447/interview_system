ALWAYS_SHORTLIST_TEST_EMAILS = {
    "navin5447499@gmail.com",
}


def should_force_shortlist(email: str | None) -> bool:
    candidate = (email or "").strip().lower()
    return bool(candidate and candidate in ALWAYS_SHORTLIST_TEST_EMAILS)
