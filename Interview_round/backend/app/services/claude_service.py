import json
import math
import re
from typing import Any

from groq import Groq

from app.core.config import settings
from app.models.schemas import QuestionItem

class GroqService:
    def __init__(self) -> None:
        self.client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None

    def _call(self, prompt: str, max_tokens: int = 500, temperature: float = 0.3) -> str:
        if not self.client:
            raise RuntimeError("GROQ_API_KEY is not configured")

        response = self.client.chat.completions.create(
            model=settings.groq_model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )

        message = response.choices[0].message.content if response.choices else ""
        return message or ""

    @staticmethod
    def _extract_json(text: str) -> Any:
        start_obj = text.find("{")
        end_obj = text.rfind("}")
        if start_obj != -1 and end_obj != -1 and start_obj < end_obj:
            return json.loads(text[start_obj : end_obj + 1])

        start_arr = text.find("[")
        end_arr = text.rfind("]")
        if start_arr != -1 and end_arr != -1 and start_arr < end_arr:
            return json.loads(text[start_arr : end_arr + 1])

        raise ValueError("No JSON content found")

    @staticmethod
    def _target_counts(total_questions: int, scenario_percentage: int, resume_validation_percentage: int) -> tuple[int, int]:
        total = max(8, min(12, total_questions))
        scenario_target = max(1, int(round(total * (scenario_percentage / 100))))
        resume_target = max(1, int(round(total * (resume_validation_percentage / 100))))

        max_special = max(2, total - 2)
        while scenario_target + resume_target > max_special and (scenario_target > 1 or resume_target > 1):
            if scenario_target >= resume_target and scenario_target > 1:
                scenario_target -= 1
            elif resume_target > 1:
                resume_target -= 1

        return scenario_target, resume_target

    @staticmethod
    def _normalize_type(raw: str) -> str:
        value = (raw or "").strip().lower()
        if "scenario" in value:
            return "scenario-based"
        if "resume" in value or "validation" in value or "confidence" in value:
            return "resume-validation"
        if "behavior" in value:
            return "behavioral"
        if "culture" in value:
            return "culture-fit"
        if "communication" in value:
            return "communication"
        if "lead" in value:
            return "leadership"
        return "role-specific"

    @staticmethod
    def _extract_topics(hr_prompt: str, role: str, resume_skills: list[str]) -> list[str]:
        skills = [str(s).strip() for s in (resume_skills or []) if str(s).strip()]
        prompt = (hr_prompt or "").strip()
        collected: list[str] = []

        match = re.search(r"focus topics\s*:\s*([^\n\.]+)", prompt, flags=re.IGNORECASE)
        if match:
            collected.extend([item.strip() for item in re.split(r",|;|\|", match.group(1)) if item.strip()])

        if not collected and prompt:
            seed = re.split(r"\.|\n", prompt)[0]
            collected.extend([item.strip() for item in re.split(r",|;|\|", seed) if item.strip()])

        collected.extend(skills[:8])

        sanitized: list[str] = []
        seen: set[str] = set()
        for topic in collected:
            normalized = re.sub(r"\s+", " ", topic).strip(" .:-")
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            sanitized.append(normalized)

        defaults = [
            role,
            "problem solving",
            "system design",
            "debugging",
            "communication",
            "culture fit",
            "stakeholder management",
        ]
        for item in defaults:
            key = item.strip().lower()
            if key and key not in seen:
                sanitized.append(item)
                seen.add(key)

        return sanitized[:10]

    @staticmethod
    def _unique_question_items(items: list[QuestionItem], total: int) -> list[QuestionItem]:
        unique: list[QuestionItem] = []
        seen: set[str] = set()

        for q in items:
            key = re.sub(r"\s+", " ", (q.question or "")).strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(q)
            if len(unique) >= total:
                break

        normalized: list[QuestionItem] = []
        for idx, q in enumerate(unique[:total], start=1):
            normalized.append(
                QuestionItem(
                    id=f"q{idx}",
                    question=q.question,
                    type=q.type,
                    difficulty=q.difficulty,
                    expected_keywords=q.expected_keywords,
                    expected_answer=q.expected_answer,
                    rubric=q.rubric,
                    assessment_focus=q.assessment_focus,
                )
            )
        return normalized

    @staticmethod
    def _build_expected_answer(keywords: list[str], assessment_focus: str, question: str) -> str:
        parts = [
            "Candidate should provide a structured response with specific ownership, rationale, and measurable outcomes.",
        ]
        if assessment_focus:
            parts.append(f"Primary competency to validate: {assessment_focus}.")
        if keywords:
            parts.append(f"Expected signals: {', '.join(keywords)}.")
        else:
            parts.append(f"Question context: {question[:180]}.")
        return " ".join(parts)

    @staticmethod
    def _to_number(value: Any) -> float | None:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            stripped = value.strip().lower()
            if not stripped:
                return None
            cleaned = stripped.replace("/10", "").replace("out of 10", "").strip()
            try:
                return float(cleaned)
            except ValueError:
                match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
                if not match:
                    return None
                try:
                    return float(match.group(0))
                except ValueError:
                    return None
        return None

    @staticmethod
    def _weighted_overall(scores: dict[str, Any]) -> float | None:
        weights = {
            "correctness": 0.20,
            "depth": 0.20,
            "clarity": 0.15,
            "relevance": 0.15,
            "confidence": 0.15,
            "hr_alignment": 0.15,
        }
        weighted_sum = 0.0
        used_weight = 0.0
        for field, weight in weights.items():
            value = scores.get(field)
            if isinstance(value, (int, float)):
                weighted_sum += float(value) * weight
                used_weight += weight

        if used_weight <= 0:
            return None

        return round(weighted_sum / used_weight, 2)

    def _normalize_eval_scores(self, raw: dict[str, Any], transcript: str, keywords: list[str]) -> dict[str, Any]:
        field_aliases = {
            "correctness": ["correctness", "accuracy", "technical_correctness"],
            "depth": ["depth", "detail", "completeness"],
            "clarity": ["clarity", "communication", "articulation"],
            "relevance": ["relevance", "alignment", "keyword_relevance"],
            "confidence": ["confidence", "ownership_confidence", "assertiveness"],
            "hr_alignment": ["hr_alignment", "culture_fit", "fit", "alignment_with_hr"],
            "overall": ["overall", "score", "marks", "rating", "final_score", "total_score"],
        }

        normalized: dict[str, Any] = {}
        for field, aliases in field_aliases.items():
            num: float | None = None
            for alias in aliases:
                if alias in raw:
                    num = self._to_number(raw.get(alias))
                    if num is not None:
                        break
            if num is None:
                normalized[field] = None
            else:
                normalized[field] = round(max(0.0, min(10.0, num)), 2)

        weighted = self._weighted_overall(normalized)
        if weighted is not None:
            normalized["overall"] = weighted

        if normalized["overall"] is None:
            words = len(transcript.split())
            keyword_hits = sum(1 for kw in keywords if kw.lower() in transcript.lower())
            normalized["overall"] = round(min(10.0, max(1.0, 3.5 + (words / 30) + min(2.5, keyword_hits * 0.6))), 2)

        normalized["resume_authenticity"] = str(raw.get("resume_authenticity") or "uncertain").strip().lower() or "uncertain"
        normalized["feedback"] = str(raw.get("feedback") or "No feedback available.").strip()

        tips = raw.get("improvement_tips")
        if isinstance(tips, list):
            normalized["improvement_tips"] = [str(t).strip() for t in tips if str(t).strip()]
        elif isinstance(tips, str) and tips.strip():
            normalized["improvement_tips"] = [tips.strip()]
        else:
            normalized["improvement_tips"] = []

        return normalized

    def _fallback_questions(
        self,
        role: str,
        resume_summary: str,
        resume_skills: list[str],
        hr_prompt: str,
        total_questions: int,
        scenario_target: int,
        resume_target: int,
    ) -> list[QuestionItem]:
        skills = [s for s in resume_skills if s.strip()][:6]
        topics = self._extract_topics(hr_prompt, role, skills)

        scenario_templates = [
            "You are leading a {role} project focused on {topic}. A production incident appears one day before release; how will you diagnose root cause, communicate risk, and recover delivery?",
            "For a {role} system centered on {topic}, latency suddenly doubles after deployment. Walk through your triage plan, rollback criteria, and postmortem actions.",
            "In a {role} initiative around {topic}, two solutions conflict on speed vs reliability. How will you decide, justify trade-offs, and align stakeholders?",
            "Your team is building {topic} capability for this {role}. Mid-sprint, requirements change. How do you re-scope without compromising quality?",
        ]
        scenario_pool = []
        for idx, topic in enumerate(topics[:6]):
            template = scenario_templates[idx % len(scenario_templates)]
            scenario_pool.append(
                (
                    template.format(role=role, topic=topic),
                    "hard" if idx % 2 == 0 else "medium",
                    [topic.lower(), "root cause", "trade-off", "risk", "communication"],
                    f"Scenario decision making in {topic}",
                )
            )

        resume_templates = [
            "Your resume mentions {topic}. Explain one project where you applied it deeply, the key design decisions you made, and measurable business impact.",
            "You listed experience in {topic}. Describe a difficult bug or failure you handled and how your approach improved the final outcome.",
            "From your resume, pick the strongest {topic} example and explain your exact contribution versus team contribution.",
            "You claim proficiency in {topic}. If we review your code/work artifacts, what concrete signals should we see?",
        ]
        resume_pool = []
        for idx, topic in enumerate((skills or topics)[:6]):
            template = resume_templates[idx % len(resume_templates)]
            resume_pool.append(
                (
                    template.format(topic=topic),
                    "medium",
                    [topic.lower(), "ownership", "impact", "decision"],
                    f"Resume authenticity for {topic}",
                )
            )

        communication_topic = topics[0] if topics else role
        culture_topic = topics[1] if len(topics) > 1 else "team collaboration"
        core_pool = [
            (
                f"How would you explain a complex {communication_topic} trade-off to a non-technical stakeholder in under two minutes?",
                "communication",
                "medium",
                ["clarity", "stakeholder", "trade-off", "communication"],
                "Communication under technical constraints",
            ),
            (
                f"Describe a time your team values were tested while working on {culture_topic}. What did you do and what did you learn?",
                "culture-fit",
                "easy",
                ["values", "ownership", "collaboration", "learning"],
                "Culture alignment and behavior",
            ),
            (
                f"What does strong performance in the first 90 days look like for this {role} role, based on recruiter priorities?",
                "role-specific",
                "medium",
                ["outcomes", "execution", "impact", "priorities"],
                "Role clarity",
            ),
            (
                "Tell me about difficult feedback you received and how your working style changed afterward.",
                "behavioral",
                "easy",
                ["self-awareness", "adaptability", "growth"],
                "Behavioral maturity",
            ),
        ]

        questions: list[QuestionItem] = []
        qid = 1

        for idx in range(scenario_target):
            q, difficulty, keywords, focus = scenario_pool[idx % len(scenario_pool)]
            questions.append(
                QuestionItem(
                    id=f"q{qid}",
                    question=q,
                    type="scenario-based",
                    difficulty=difficulty,
                    expected_keywords=keywords,
                    expected_answer=self._build_expected_answer(keywords, focus, q),
                    rubric=f"Assess {focus.lower()}: structure, ownership, and measurable outcome quality.",
                    assessment_focus=focus,
                )
            )
            qid += 1

        for idx in range(resume_target):
            q, difficulty, keywords, focus = resume_pool[idx % len(resume_pool)]
            questions.append(
                QuestionItem(
                    id=f"q{qid}",
                    question=q,
                    type="resume-validation",
                    difficulty=difficulty,
                    expected_keywords=keywords,
                    expected_answer=self._build_expected_answer(keywords, focus, q),
                    rubric=f"Assess {focus.lower()}: authenticity, specificity, and verifiable evidence.",
                    assessment_focus=focus,
                )
            )
            qid += 1

        while len(questions) < total_questions:
            q, qtype, difficulty, keywords, focus = core_pool[(len(questions) - scenario_target - resume_target) % len(core_pool)]
            questions.append(
                QuestionItem(
                    id=f"q{qid}",
                    question=q,
                    type=qtype,
                    difficulty=difficulty,
                    expected_keywords=keywords,
                    expected_answer=self._build_expected_answer(keywords, focus, q),
                    rubric=f"Assess {focus.lower()}: communication quality and practical decision clarity.",
                    assessment_focus=focus,
                )
            )
            qid += 1

        return self._unique_question_items(questions, total_questions)

    def generate_questions(
        self,
        role: str,
        resume_summary: str,
        resume_skills: list[str] | None = None,
        hr_prompt: str = "",
        scenario_percentage: int = 35,
        resume_validation_percentage: int = 25,
        total_questions: int = 10,
    ) -> list[QuestionItem]:
        skills = resume_skills or []
        total = max(8, min(12, total_questions))
        scenario_target, resume_target = self._target_counts(total, scenario_percentage, resume_validation_percentage)

        topics = self._extract_topics(hr_prompt, role, skills)

        prompt = f'''You are a senior technical interviewer designing a round-3 technical interview.

Role: {role}
Resume summary: {resume_summary}
Resume skills: {skills}
HR expectation brief: {hr_prompt or 'Evaluate ownership, communication, problem solving, and culture fit.'}
    Recruiter priority topics: {topics}

Generate exactly {total} interview questions and return only valid JSON array.
Mandatory constraints:
- Exactly {scenario_target} questions must be type "scenario-based".
- Exactly {resume_target} questions must be type "resume-validation" to verify confidence and authenticity of resume claims.
- Remaining questions should be distributed across: behavioral, communication, leadership, culture-fit, role-specific.
    - At least 60% of questions must explicitly reference recruiter priority topics or resume skills.
    - Include technical depth and practical trade-offs, while keeping some communication and culture-fit evaluation.
- Avoid duplicate questions.

Return format:
[
  {{
    "id": "q1",
    "question": "...",
    "type": "scenario-based|resume-validation|behavioral|communication|leadership|culture-fit|role-specific",
    "difficulty": "easy|medium|hard",
    "expected_keywords": ["..."],
    "assessment_focus": "What competency this question validates"
  }}
]'''

        try:
            data = self._extract_json(self._call(prompt))
            parsed: list[QuestionItem] = []
            scenario_count = 0
            resume_count = 0

            for idx, item in enumerate(data, start=1):
                q_type = self._normalize_type(str(item.get("type", "")))
                if q_type == "scenario-based":
                    scenario_count += 1
                if q_type == "resume-validation":
                    resume_count += 1

                parsed.append(
                    QuestionItem(
                        id=f"q{idx}",
                        question=str(item.get("question", "")).strip(),
                        type=q_type,
                        difficulty=str(item.get("difficulty", "medium")).lower(),
                        expected_keywords=[str(k).strip().lower() for k in item.get("expected_keywords", []) if str(k).strip()],
                        expected_answer=(str(item.get("expected_answer", "")).strip() or None),
                        rubric=(str(item.get("rubric", "")).strip() or None),
                        assessment_focus=str(item.get("assessment_focus", "")).strip() or None,
                    )
                )

            parsed = [q for q in parsed if q.question]
            if parsed:
                rebalance_pool = self._fallback_questions(
                    role=role,
                    resume_summary=resume_summary,
                    resume_skills=skills,
                    hr_prompt=hr_prompt,
                    total_questions=total,
                    scenario_target=scenario_target,
                    resume_target=resume_target,
                )

                # Deduplicate while preserving generated questions first.
                unique: list[QuestionItem] = []
                seen_questions: set[str] = set()
                for q in parsed:
                    key = q.question.strip().lower()
                    if not key or key in seen_questions:
                        continue
                    seen_questions.add(key)
                    unique.append(q)

                scenario_count = sum(1 for q in unique if q.type == "scenario-based")
                resume_count = sum(1 for q in unique if q.type == "resume-validation")

                if scenario_count < scenario_target:
                    for q in rebalance_pool:
                        if q.type != "scenario-based":
                            continue
                        key = q.question.strip().lower()
                        if key in seen_questions:
                            continue
                        unique.append(q)
                        seen_questions.add(key)
                        scenario_count += 1
                        if scenario_count >= scenario_target:
                            break

                if resume_count < resume_target:
                    for q in rebalance_pool:
                        if q.type != "resume-validation":
                            continue
                        key = q.question.strip().lower()
                        if key in seen_questions:
                            continue
                        unique.append(q)
                        seen_questions.add(key)
                        resume_count += 1
                        if resume_count >= resume_target:
                            break

                for q in rebalance_pool:
                    if len(unique) >= total:
                        break
                    key = q.question.strip().lower()
                    if key in seen_questions:
                        continue
                    unique.append(q)
                    seen_questions.add(key)

                normalized: list[QuestionItem] = []
                for idx, q in enumerate(unique[:total], start=1):
                    normalized.append(
                        QuestionItem(
                            id=f"q{idx}",
                            question=q.question,
                            type=self._normalize_type(q.type),
                            difficulty=(q.difficulty or "medium").lower(),
                            expected_keywords=q.expected_keywords,
                            expected_answer=q.expected_answer,
                            rubric=q.rubric,
                            assessment_focus=q.assessment_focus,
                        )
                    )

                return self._unique_question_items(normalized, total)

            raise ValueError("No usable questions produced by model")
        except Exception:
            return self._fallback_questions(
                role=role,
                resume_summary=resume_summary,
                resume_skills=skills,
                hr_prompt=hr_prompt,
                total_questions=total,
                scenario_target=scenario_target,
                resume_target=resume_target,
            )

    def evaluate_response(
        self,
        question: str,
        transcript: str,
        keywords: list[str],
        expected_answer: str = "",
        rubric: str = "",
        role: str = "",
        hr_prompt: str = "",
        question_type: str = "",
        resume_summary: str = "",
        assessment_focus: str = "",
    ) -> dict[str, Any]:
        prompt = f'''You are an enterprise HR evaluator.

Evaluate the candidate answer with strict professional standards.
Role: {role}
Question type: {question_type}
Assessment focus: {assessment_focus}
HR expectation brief: {hr_prompt}
Resume summary (for authenticity checks): {resume_summary}

Question: {question}
Candidate answer: {transcript}
Expected answer/rubric: {expected_answer}
Rubric detail: {rubric}
Expected keywords/signals: {keywords}

Scoring rules:
- Score 1-10 for correctness, depth, clarity, relevance, confidence, hr_alignment.
- confidence means conviction + specificity + ownership in communication.
- hr_alignment means fit against the HR expectation brief.
- Provide overall as weighted score:
  correctness 20%, depth 20%, clarity 15%, relevance 15%, confidence 15%, hr_alignment 15%.
- Identify resume_authenticity as one of: "strong", "uncertain", "weak".

Return only JSON:
{{
  "correctness": number,
  "depth": number,
  "clarity": number,
  "relevance": number,
  "confidence": number,
  "hr_alignment": number,
  "overall": number,
  "resume_authenticity": "strong|uncertain|weak",
  "feedback": "short paragraph",
  "improvement_tips": ["tip1", "tip2"]
}}'''

        try:
            raw_text = self._call(prompt, max_tokens=500, temperature=0.0)
            print(f"[EVAL OUTPUT] Raw LLM response: {raw_text}")
            raw = self._extract_json(raw_text)
            if not isinstance(raw, dict):
                raise ValueError("Evaluator response is not a JSON object")
            normalized = self._normalize_eval_scores(raw, transcript, keywords)
            print(f"[EVAL PARSED] Score: {normalized.get('overall')}")
            return normalized
        except Exception:
            words = len(transcript.split())
            base = min(10, max(1, math.ceil(words / 22) + 3))
            keyword_hits = sum(1 for kw in keywords if kw.lower() in transcript.lower())
            keyword_score = min(10, 4 + keyword_hits)
            confidence = min(10, 4 + (1 if "i " in transcript.lower() else 0) + (1 if any(ch.isdigit() for ch in transcript) else 0))
            hr_alignment = round((base + keyword_score) / 2, 2)
            overall = round(
                (base * 0.2)
                + (max(1, base - 1) * 0.2)
                + (base * 0.15)
                + (keyword_score * 0.15)
                + (confidence * 0.15)
                + (hr_alignment * 0.15),
                2,
            )
            return {
                "correctness": base,
                "depth": max(1, base - 1),
                "clarity": base,
                "relevance": keyword_score,
                "confidence": confidence,
                "hr_alignment": hr_alignment,
                "overall": overall,
                "resume_authenticity": "uncertain",
                "feedback": "Answer was evaluated with fallback heuristics due to Claude unavailability.",
                "improvement_tips": [
                    "Use one concrete example with measurable impact.",
                    "State your decision criteria and ownership clearly.",
                ],
            }

    def generate_follow_up(self, transcript: str, overall_score: float) -> str:
        prompt = f'''Based on this answer: {transcript}
Generate 1 adaptive follow-up question to probe deeper.
If answer was weak: ask a simpler clarifying question.
If answer was strong: ask a harder extension question.'''
        try:
            return self._call(prompt, max_tokens=200, temperature=0.3).strip()
        except Exception:
            if overall_score >= 7:
                return "Good direction. How would your approach change at 10x scale and why?"
            return "Can you walk me through a concrete example step by step?"
groq_service = GroqService()