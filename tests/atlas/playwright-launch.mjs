import fs from 'node:fs';
import path from 'node:path';

function windowsBrowserPaths() {
  if (process.platform !== 'win32') return [];
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean);
  return [...new Set(candidates.filter(candidate => fs.existsSync(candidate)))];
}

export async function launchAtlasBrowser(chromium, options = {}) {
  const attempts = [
    { label: 'Playwright Chromium', options: { ...options } },
    { label: 'Microsoft Edge channel', options: { ...options, channel: 'msedge' } },
    { label: 'Google Chrome channel', options: { ...options, channel: 'chrome' } },
    ...windowsBrowserPaths().map(executablePath => ({ label: executablePath, options: { ...options, executablePath } }))
  ];
  const failures = [];
  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch(attempt.options);
      console.log(`ATLAS browser QA launch: ${attempt.label}`);
      return browser;
    } catch (error) {
      failures.push(`${attempt.label}: ${error?.message || error}`);
    }
  }
  const error = new Error(`ATLAS browser QA could not start a supported Chromium browser. ${failures.join(' | ')}`);
  error.code = 'ATLAS_BROWSER_UNAVAILABLE';
  throw error;
}
