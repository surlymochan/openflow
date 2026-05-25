#!/usr/bin/env python3
"""
H1.design.lite_gate — Deterministic DESIGN.md sanity check.
Checks for required section headings: Reference Anchors, Beauty Contract, Layout Premise.
Does NOT invoke any LLM. Returns JSON verdict.
"""
import sys, os, json, argparse

REQUIRED_SECTIONS = [
    'Reference Anchors',
    'Anti-References',
    'Layout Premise',
    'Beauty Contract',
    'Failure Modes',
]

MINIMAL_SECTIONS = [
    'Visual Tone',
    'Color System',
    'Typography',
]

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id')
    p.add_argument('--require-full-contract', action='store_true')
    args = p.parse_args()

    # Check project-level DESIGN.md first, then change-scoped design.md
    design_md = os.path.join(args.project_root, 'DESIGN.md')
    change_design_md = None
    if args.change_id:
        change_design_md = os.path.join(args.project_root, 'specs', 'changes', args.change_id, 'design.md')

    target = change_design_md if (change_design_md and os.path.exists(change_design_md)) else design_md

    if not os.path.exists(target):
        result = {
            'ok': False,
            'gate': 'H1.design.lite_gate',
            'verdict': 'missing',
            'message': f'No DESIGN.md or design.md found at {target}',
            'path': target,
        }
        print(json.dumps(result))
        sys.exit(1)

    content = open(target).read()
    missing = []

    if args.require_full_contract:
        sections = REQUIRED_SECTIONS
    else:
        sections = MINIMAL_SECTIONS

    for sec in sections:
        if sec not in content:
            missing.append(sec)

    ok = len(missing) == 0
    result = {
        'ok': ok,
        'gate': 'H1.design.lite_gate',
        'verdict': 'pass' if ok else 'fail',
        'path': target,
        'missing_sections': missing,
        'checked_sections': sections,
    }
    print(json.dumps(result))
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
