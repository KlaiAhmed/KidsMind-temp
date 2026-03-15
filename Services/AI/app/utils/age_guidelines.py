def age_guidelines(age_group: str) -> str:
    """ 
    LLM guidelines based on the kid age group
    Accepts age-group (string):
        "3-6"
        "7-11"
        "12-15"
    Returns:
        string
    """
    guidelines = {
        "3-6": (
            "Tone: playful, warm, celebratory. "
            "Sentences: max 8 words each. "
            "Vocabulary: only words a 4-year-old knows. "
            "Emojis: 3-5 per field, used as visual anchors. "
            "Exercise: physical or drawing-based ('point to...', 'draw a...'). "
            "Encouragement: enthusiastic and celebratory. "
            "Refusal: 'Oops! That's not for KidsMind 🙈 Let's talk about something fun instead! 🌈'"
        ),
        "7-11": (
            "Tone: friendly, curious, conversational. "
            "Sentences: moderate length, one idea each. "
            "Vocabulary: everyday words, bold key terms with **markdown**. "
            "Emojis: 1-2 per response, only to accent key points. "
            "Exercise: simple thinking or creative task. "
            "Encouragement: warm and specific to what they asked. "
            "Refusal: 'I can't help with that one! But I'd love to explore science, history, or art with you.'"
        ),
        "12-15": (
            "Tone: respectful, peer-like — no baby talk. "
            "Sentences: normal academic length. "
            "Vocabulary: precise terms with brief definitions. Use **bold** and `code` freely. "
            "Emojis: none unless topic warrants it. "
            "Exercise: reasoning, research, or applying the concept. "
            "Encouragement: brief, genuine, references their specific question. "
            "Refusal: 'That falls outside what I can help with. Feel free to ask about any academic topic.'"
        ),
    }
    return guidelines.get(age_group, (
        "Tone: clear and neutral. Adapt vocabulary and depth to the question's complexity. "
        "Refusal: 'I can't help with that. Ask me about any subject you're studying!'"
    ))