import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('CI/CD Workflow Configuration Constraints Integrity', () => {
  const ciWorkflowPath = path.resolve(__dirname, '../.github/workflows/ci.yml');
  const deployWorkflowPath = path.resolve(__dirname, '../.github/workflows/deploy.yml');

  it('CI workflow file exists and deploy workflow file was consolidated', () => {
    expect(fs.existsSync(ciWorkflowPath)).toBe(true);
    expect(fs.existsSync(deployWorkflowPath)).toBe(false);
  });

  it('CI workflow contains mandatory jobs and step rules', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');

    // 1. docs:check present
    expect(content).toContain('npm run docs:check');

    // 2. coverage job present
    expect(content).toContain('coverage:');
    expect(content).toContain('npm run test:coverage');

    // 3. deploy job depends on e2e
    expect(content).toMatch(/deploy:[\s\S]*?needs:\s*e2e/);

    // 4. deploy job does NOT contain npm run build or npm test
    const deploySectionMatch = content.match(/deploy:[\s\S]*$/);
    expect(deploySectionMatch).not.toBeNull();
    const deploySection = deploySectionMatch[0];

    expect(deploySection).not.toContain('npm run build');
    expect(deploySection).not.toContain('npm test');

    // 5. deploy job downloads build artifact
    expect(content).toContain('actions/download-artifact@v4');

    // 6. Firefox and WebKit present in smoke matrix / install step
    expect(content).toContain('firefox');
    expect(content).toContain('webkit');

    // 7. Artifact name is bound to commit SHA
    expect(content).toContain('kotokitsu-dist-${{ github.sha }}');
  });
});
