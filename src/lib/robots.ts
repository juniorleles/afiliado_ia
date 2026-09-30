/** robots.txt wildcard-group allow/deny. Never used to bypass a disallow. */
export function checkRobotsRules(robotsText: string, path: string): boolean {
  const lines = robotsText.split("\n").map((l) => l.trim());
  let inWildcardGroup = false;
  let disallowed = false;

  for (const line of lines) {
    if (/^user-agent:\s*\*\s*$/i.test(line)) {
      inWildcardGroup = true;
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      inWildcardGroup = false;
      continue;
    }
    if (inWildcardGroup && /^disallow:/i.test(line)) {
      const rule = line.split(":").slice(1).join(":").trim();
      if (rule !== "" && path.startsWith(rule)) {
        disallowed = true;
      }
    }
  }

  return !disallowed;
}
