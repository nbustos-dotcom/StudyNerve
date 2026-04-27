SUBJECT_MAP: dict[str, list[str]] = {
    "Mathematics": ["math", "maths", "calculus", "algebra", "statistics", "geometry", "trig", "trigonometry", "linear algebra", "differential equations"],
    "Computer Science": ["cs", "programming", "coding", "software", "algorithms", "data structures", "python", "java", "javascript", "computering", "computing"],
    "Biology": ["bio", "anatomy", "physiology", "ecology", "genetics", "microbiology", "botany", "zoology"],
    "Chemistry": ["chem", "organic chemistry", "biochemistry", "inorganic chemistry"],
    "Physics": ["phys", "mechanics", "thermodynamics", "electromagnetism", "quantum"],
    "Geology": ["earth science", "understanding the earth", "mineralogy", "petrology", "geoscience"],
    "History": ["world history", "us history", "american history", "european history"],
    "English": ["literature", "writing", "composition", "rhetoric", "english lit"],
    "Psychology": ["psych", "behavioral science"],
    "Engineering": ["mechanical engineering", "electrical engineering", "civil engineering", "engineering fundamentals"],
    "Business": ["accounting", "finance", "marketing", "management", "economics", "econ"],
    "Philosophy": ["ethics", "logic", "metaphysics"],
}

# Sorted (standard, alias) pairs by alias length descending for greedy substring matching
_ALIAS_PAIRS: list[tuple[str, str]] = sorted(
    [(std, alias) for std, aliases in SUBJECT_MAP.items() for alias in aliases],
    key=lambda x: len(x[1]),
    reverse=True,
)


def normalize_subject(raw_subject: str) -> str:
    if not raw_subject or not raw_subject.strip():
        return raw_subject

    s = raw_subject.strip()
    lowered = s.lower()

    # Exact match to standard name (case-insensitive)
    for standard in SUBJECT_MAP:
        if lowered == standard.lower():
            return standard

    # Exact match to any alias
    for standard, alias in _ALIAS_PAIRS:
        if lowered == alias:
            return standard

    # Alias is a substring of input (longest alias wins)
    for standard, alias in _ALIAS_PAIRS:
        if alias in lowered:
            return standard

    # No match: capitalize first letter, preserve the rest
    return s[0].upper() + s[1:]


def get_subject_list() -> list[str]:
    return sorted(SUBJECT_MAP.keys())
