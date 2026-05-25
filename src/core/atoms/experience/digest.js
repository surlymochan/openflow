import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { readJsonFile, resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function experienceDigest(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  if (!changeId) throw new Error('change_id is required for experience.digest');

  const entries = collectExperienceEntries(projectRoot);
  const digest = {
    version: 1,
    change_id: changeId,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    entry_count: entries.length,
    entries: entries.map((entry) => ({
      title: entry.title || entry.summary || 'Untitled experience',
      category: entry.category || 'workflow',
      content: entry.content || entry.summary || '',
      confidence: entry.confidence ?? null,
      source: entry.source || null,
    })),
  };
  const outputPath = resolveChangePath(projectRoot, changeId, 'experience_digest.json');
  writeJsonFile(outputPath, digest);
  return {
    ok: true,
    experience_digest_file: outputPath,
    digest,
  };
}

function collectExperienceEntries(projectRoot) {
  const sources = [];
  const localDir = resolve(projectRoot, '.xflow', 'experience');
  if (existsSync(localDir)) {
    for (const file of readdirSync(localDir)) {
      if (file.endsWith('.json')) sources.push(resolve(localDir, file));
    }
  }
  const teamExperience = resolve(projectRoot, '.xflow', 'storage', 'team', 'experience.json');
  if (existsSync(teamExperience)) sources.push(teamExperience);

  const entries = [];
  for (const source of sources) {
    const payload = readJsonFile(source, {});
    const sourceEntries = Array.isArray(payload.entries) ? payload.entries : Array.isArray(payload) ? payload : [];
    for (const entry of sourceEntries) {
      entries.push({ ...entry, source });
    }
  }
  return entries;
}
