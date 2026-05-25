#!/usr/bin/env python3
"""
J4a.spec_consistency.structural — Deterministic structural drift check.
Extends doctor.py with proposal/plan/AHA consistency checks.
Catches ~80% of drifts deterministically. Semantic drift stays LLM-driven (J4b).
"""
import sys, os, json, argparse, re

def load_json_if_exists(path):
    if os.path.exists(path):
        try:
            return json.loads(open(path).read())
        except Exception:
            return None
    return None

def load_text_if_exists(path):
    if os.path.exists(path):
        return open(path).read()
    return None

def extract_section_headings(md_text):
    """Extract all ## and ### headings from markdown."""
    if not md_text:
        return []
    return re.findall(r'^#{1,3} (.+)$', md_text, re.MULTILINE)

def extract_task_items(md_text):
    """Extract task checklist items from markdown."""
    if not md_text:
        return []
    return re.findall(r'- \[[ x]\] (.+)', md_text)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--json', action='store_true')
    args = p.parse_args()

    change_dir = os.path.join(args.project_root, 'specs', 'changes', args.change_id)
    issues = []
    warnings = []

    # 1. Required files exist
    for fname in ['proposal.md', 'plan.md', 'tasks.md', 'status.json']:
        fpath = os.path.join(change_dir, fname)
        if not os.path.exists(fpath):
            issues.append(f'Missing required file: {fpath}')

    # 2. status.json fields
    status = load_json_if_exists(os.path.join(change_dir, 'status.json'))
    if status:
        for field in ['change_id', 'title', 'change_type', 'status', 'current_stage']:
            if not status.get(field):
                issues.append(f'status.json missing field: {field}')
        if status.get('change_id') != args.change_id:
            issues.append(f'status.json change_id mismatch: {status.get("change_id")} != {args.change_id}')

    # 3. proposal.md has minimum structure
    proposal_text = load_text_if_exists(os.path.join(change_dir, 'proposal.md'))
    if proposal_text:
        headings = extract_section_headings(proposal_text)
        for required_h in ['Problem', 'Scope']:
            if not any(required_h.lower() in h.lower() for h in headings):
                warnings.append(f'proposal.md missing expected section: "{required_h}" (found: {headings})')
    else:
        issues.append('proposal.md is empty or missing')

    # 4. plan.md may coexist with tasks.md, but plan itself stays reusable
    plan_text = load_text_if_exists(os.path.join(change_dir, 'plan.md'))
    tasks_text = load_text_if_exists(os.path.join(change_dir, 'tasks.md'))
    if plan_text and len(plan_text.strip()) < 100:
        warnings.append('plan.md seems too short (< 100 chars)')
    if tasks_text:
        task_items = extract_task_items(tasks_text)
        if len(task_items) == 0:
            warnings.append('tasks.md has no checklist items')

    # 5. AHA.md keyword collision check (if AHA.md exists at root)
    aha_path = os.path.join(args.project_root, 'AHA.md')
    aha_text = load_text_if_exists(aha_path)
    if aha_text and proposal_text:
        # Simple heuristic: look for any "must not" or "avoid" rules in AHA that match keywords in proposal
        must_not = re.findall(r'(?:must not|avoid|do not)\s+(.+?)(?:\.|$)', aha_text, re.IGNORECASE)
        for rule in must_not:
            rule_lower = rule.lower().strip()
            if len(rule_lower) > 10 and rule_lower in proposal_text.lower():
                warnings.append(f'Proposal may conflict with AHA rule: "{rule_lower}"')

    ok = len(issues) == 0
    result = {
        'ok': ok,
        'gate': 'J4a.spec_consistency.structural',
        'verdict': 'pass' if ok else 'fail',
        'issues': issues,
        'warnings': warnings,
        'change_id': args.change_id,
    }

    print(json.dumps(result, indent=2))
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
