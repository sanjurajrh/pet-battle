const scanner = require('sonarqube-scanner');

scanner(
  {
    serverUrl: 'http://sonarqube-sonarqube:9000',
    options: {
      'sonar.login': process.env.SONARQUBE_USERNAME,
      'sonar.password': process.env.SONARQUBE_PASSWORD,
      'sonar.projectName': 'Pet Battle',
      'sonar.projectDescription': 'Pet Battle UI',
      'sonar.sources': 'src',
      'sonar.tests': 'src',
      'sonar.inclusions': '**', // Entry point of your code
      'sonar.test.inclusions': 'src/**/*.spec.js,src/**/*.spec.ts,src/**/*.spec.jsx,src/**/*.test.js,src/**/*.test.jsx',
      'sonar.exclusions': '**/node_modules/**',
      //'sonar.test.exclusions': 'src/app/core/*.spec.ts',
      'sonar.javascript.lcov.reportPaths': 'reports/lcov.info',
      // 'sonar.testExecutionReportPaths': 'coverage/test-reporter.xml'
    }
  },
  () => process.exit()
);
