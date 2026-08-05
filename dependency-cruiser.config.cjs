/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'This dependency is part of a cycle which complicates code reuse and testing.',
      from: {
        pathNot: '^(node_modules|tests|scripts|dist|coverage)',
      },
      to: {
        circular: true,
        viaNot: '^ui/lazy-screen-loader\\.js$',
      },
    },
    {
      name: 'no-imports-of-app-js',
      severity: 'error',
      comment: 'Production modules should not import app.js; app.js is a composition root.',
      from: {
        pathNot: '^(tests|scripts)',
      },
      to: {
        path: '^app\\.js$',
      },
    },
    {
      name: 'no-core-to-ui-or-bootstrap',
      severity: 'error',
      comment: 'Core domain logic should not depend on UI or bootstrap modules.',
      from: {
        path: '^(state/|srs\\.js|achievements\\.js|quests\\.js|studyplan\\.js|src/xp-system\\.js|src/chapter-progress\\.js)',
      },
      to: {
        path: '^(ui/|bootstrap/)',
      },
    },
    {
      name: 'no-courses-to-ui-or-bootstrap',
      severity: 'error',
      comment: 'Course content and manifests must not import UI or bootstrap modules.',
      from: {
        path: '^(courses/|src/courses/)',
      },
      to: {
        path: '^(ui/|bootstrap/|app\\.js)',
      },
    },
    {
      name: 'no-features-to-bootstrap',
      severity: 'error',
      comment: 'Features and UI components should not depend on bootstrap initialization modules.',
      from: {
        path: '^(ui/|src/)',
      },
      to: {
        path: '^bootstrap/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
