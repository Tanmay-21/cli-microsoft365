import config from '../../../../config';
import commands from '../../commands';
import Command, {
  CommandOption, CommandError
} from '../../../../Command';
import GlobalOptions from '../../../../GlobalOptions';
import * as path from 'path';
import * as fs from 'fs';
import { Finding, Utils } from './project-upgrade/';
import { Rule } from './project-upgrade/rules/Rule';
import { EOL } from 'os';
import { Project, Manifest } from './project-upgrade/model';

const vorpal: Vorpal = require('../../../../vorpal-init');

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  toVersion?: string;
}

class SpfxProjectUpgradeCommand extends Command {
  private projectVersion: string | undefined;
  private toVersion: string = '';
  private projectRootPath: string | null = null;
  private allFindings: Finding[] = [];
  private supportedVersions: string[] = [
    '1.4.1',
    '1.5.0'
  ];

  public get name(): string {
    return commands.PROJECT_UPGRADE;
  }

  public get description(): string {
    return 'Upgrades SharePoint Framework project to the specified version';
  }

  public getTelemetryProperties(args: CommandArgs): any {
    const telemetryProps: any = super.getTelemetryProperties(args);
    telemetryProps.toVersion = args.options.toVersion || this.supportedVersions[this.supportedVersions.length - 1];
    return telemetryProps;
  }

  public commandAction(cmd: CommandInstance, args: CommandArgs, cb: (err?: any) => void): void {
    this.projectRootPath = this.getProjectRoot(process.cwd());
    if (this.projectRootPath === null) {
      cb(new CommandError(`Couldn't find project root folder`));
      return;
    }

    this.toVersion = args.options.toVersion ? args.options.toVersion : this.supportedVersions[this.supportedVersions.length - 1];

    if (this.supportedVersions.indexOf(this.toVersion) < 0) {
      cb(new CommandError(`Office 365 CLI doesn't support upgrading SharePoint Framework projects to version ${this.toVersion}. Supported versions are ${this.supportedVersions.join(', ')}`));
      return;
    }

    this.projectVersion = this.getProjectVersion();
    if (!this.projectVersion) {
      cb(new CommandError(`Unable to determine the version of the current SharePoint Framework project`));
      return;
    }

    const pos: number = this.supportedVersions.indexOf(this.projectVersion);
    if (pos < 0) {
      cb(new CommandError(`Office 365 CLI doesn't support upgrading projects build on SharePoint Framework v${this.projectVersion}`));
      return;
    }

    if (pos > this.supportedVersions.indexOf(this.toVersion)) {
      cb(new CommandError('You cannot downgrade a project'));
      return;
    }

    if (pos === this.supportedVersions.indexOf(this.toVersion)) {
      cb(new CommandError('Project doesn\'t need to be upgraded'));
      return;
    }

    if (this.verbose) {
      cmd.log('Collecting project...');
    }
    const project: Project = this.getProject(this.projectRootPath);

    if (this.debug) {
      cmd.log('Collected project');
      cmd.log(project);
    }

    // reverse the list of versions to upgrade to, so that most recent findings
    // will end up on top already. Saves us reversing a larger array later
    const versionsToUpgradeTo: string[] = this.supportedVersions.slice(pos + 1).reverse();
    versionsToUpgradeTo.forEach(v => {
      try {
        const rules: Rule[] = require(`./project-upgrade/upgrade-${v}`);
        rules.forEach(r => {
          r.visit(project, this.allFindings);
        });
      }
      catch (e) {
        cb(new CommandError(e));
        return;
      }
    });

    // dedupe
    const findings: Finding[] = this.allFindings.filter((f: Finding, i: number, allFindings: Finding[]) => {
      const firstFindingPos: number = this.allFindings.findIndex(f1 => f1.id === f.id);
      return i === firstFindingPos;
    });

    switch (args.options.output) {
      case 'json':
        cmd.log(findings);
        break;
      case 'md':
        cmd.log(this.getMdReport(findings));
        break;
      default:
        cmd.log(findings.map(f => {
          return {
            id: f.id,
            resolution: f.resolution
          };
        }));
    }

    cb();
  }

  private getProject(projectRootPath: string): Project {
    const project: Project = {
      path: projectRootPath
    };

    const configJsonPath: string = path.join(projectRootPath, 'config/config.json');
    if (fs.existsSync(configJsonPath)) {
      try {
        project.configJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(configJsonPath, 'utf-8')));
      }
      catch { }
    }

    const copyAssetsJsonPath: string = path.join(projectRootPath, 'config/copy-assets.json');
    if (fs.existsSync(copyAssetsJsonPath)) {
      try {
        project.copyAssetsJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(copyAssetsJsonPath, 'utf-8')));
      }
      catch { }
    }

    const deployAzureStorageJsonPath: string = path.join(projectRootPath, 'config/deploy-azure-storage.json');
    if (fs.existsSync(deployAzureStorageJsonPath)) {
      try {
        project.deployAzureStorageJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(deployAzureStorageJsonPath, 'utf-8')));
      }
      catch { }
    }

    const packageJsonPath: string = path.join(projectRootPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        project.packageJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(packageJsonPath, 'utf-8')));
      }
      catch { }
    }

    const packageSolutionJsonPath: string = path.join(projectRootPath, 'config/package-solution.json');
    if (fs.existsSync(packageSolutionJsonPath)) {
      try {
        project.packageSolutionJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(packageSolutionJsonPath, 'utf-8')));
      }
      catch { }
    }

    const serveJsonPath: string = path.join(projectRootPath, 'config/serve.json');
    if (fs.existsSync(serveJsonPath)) {
      try {
        project.serveJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(serveJsonPath, 'utf-8')));
      }
      catch { }
    }

    const tsConfigJsonPath: string = path.join(projectRootPath, 'tsconfig.json');
    if (fs.existsSync(tsConfigJsonPath)) {
      try {
        project.tsConfigJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(tsConfigJsonPath, 'utf-8')));
      }
      catch { }
    }

    const tsLintJsonPath: string = path.join(projectRootPath, 'config/tslint.json');
    if (fs.existsSync(tsLintJsonPath)) {
      try {
        project.tsLintJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(tsLintJsonPath, 'utf-8')));
      }
      catch { }
    }

    const writeManifestJsonPath: string = path.join(projectRootPath, 'config/write-manifests.json');
    if (fs.existsSync(writeManifestJsonPath)) {
      try {
        project.writeManifestsJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(writeManifestJsonPath, 'utf-8')));
      }
      catch { }
    }

    const yoRcJsonPath: string = path.join(projectRootPath, '.yo-rc.json');
    if (fs.existsSync(yoRcJsonPath)) {
      try {
        project.yoRcJson = JSON.parse(Utils.removeSingleLineComments(fs.readFileSync(yoRcJsonPath, 'utf-8')));
      }
      catch { }
    }

    const manifests: Manifest[] = [];
    const files: string[] = Utils.getAllFiles(path.join(projectRootPath, 'src')) as string[];
    files.forEach(f => {
      if (f.endsWith('.manifest.json')) {
        try {
          const manifestStr = Utils.removeSingleLineComments(fs.readFileSync(f, 'utf-8'));
          const manifest: Manifest = JSON.parse(manifestStr);
          manifest.path = f;
          manifests.push(manifest);
        }
        catch { }
      }
    });
    project.manifests = manifests;

    return project;
  }

  private getMdReport(findings: Finding[]): string {
    const commandsToExecute: string[] = [];
    const findingsToReport: string[] = [];
    const modificationPerFile: any = [];
    const modificationTypePerFile: any = [];

    findings.forEach(f => {
      let resolution: string = '';
      switch (f.resolutionType) {
        case 'cmd':
          resolution = `Execute the following command:

\`\`\`sh
${f.resolution}
\`\`\`
`;
          break;
        case 'json':
          resolution = `In file [${f.file}](${f.file}) update the code as follows:

\`\`\`json
${f.resolution}
\`\`\`
`;
          break;
      }

      if (f.resolutionType === 'cmd') {
        commandsToExecute.push(f.resolution);
      }
      else {
        if (!modificationPerFile[f.file]) {
          modificationPerFile[f.file] = [];
        }
        if (!modificationTypePerFile[f.file]) {
          modificationTypePerFile[f.file] = f.resolutionType;
        }

        modificationPerFile[f.file].push(f.resolution);
      }

      findingsToReport.push(
        `### ${f.id} ${f.title} | ${f.severity}`, EOL,
        EOL,
        f.description, EOL,
        EOL,
        resolution,
        EOL,
        `File: [${f.file}](${f.file})`, EOL,
        EOL
      );
    });

    const s: string[] = [
      `# Upgrade project ${path.posix.basename(this.projectRootPath as string)} to v${this.toVersion}`, EOL,
      EOL,
      `Date: ${(new Date().toLocaleDateString())}`, EOL,
      EOL,
      '## Findings', EOL,
      EOL,
      `Following is the list of steps required to upgrade your project to SharePoint Framework version ${this.toVersion}.`, EOL,
      EOL,
      findingsToReport.join(''),
      '## Summary', EOL,
      EOL,
      '### Execute script', EOL,
      EOL,
      '```sh', EOL,
      commandsToExecute.join(EOL), EOL,
      '```', EOL,
      EOL,
      '### Modify files', EOL,
      EOL,
      Object.keys(modificationPerFile).map(file => {
        return [
          `#### [${file}](${file})`, EOL,
          EOL,
          modificationPerFile[file].map((m: string) => `\`\`\`${modificationTypePerFile[file]}${EOL}${m}${EOL}\`\`\``).join(EOL + EOL), EOL,
        ].join('');
      }).join(EOL),
      EOL,
    ];

    return s.join('').trim();
  }

  private getProjectRoot(folderPath: string): string | null {
    const packageJsonPath: string = path.resolve(folderPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return folderPath;
    }
    else {
      const parentPath: string = path.resolve(folderPath, `..${path.sep}`);
      if (parentPath !== folderPath) {
        return this.getProjectRoot(parentPath);
      }
      else {
        return null;
      }
    }
  }

  private getProjectVersion(): string | undefined {
    const yoRcPath: string = path.resolve(this.projectRootPath as string, '.yo-rc.json');
    if (fs.existsSync(yoRcPath)) {
      try {
        const yoRc: any = JSON.parse(fs.readFileSync(yoRcPath, 'utf-8'));
        if (yoRc && yoRc['@microsoft/generator-sharepoint'] &&
          yoRc['@microsoft/generator-sharepoint'].version) {
          return yoRc['@microsoft/generator-sharepoint'].version;
        }
      }
      catch { }
    }

    const packageJsonPath: string = path.resolve(this.projectRootPath as string, 'package.json');
    try {
      const packageJson: any = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson &&
        packageJson.dependencies &&
        packageJson.dependencies['@microsoft/sp-core-library']) {
        const coreLibVersion: string = packageJson.dependencies['@microsoft/sp-core-library'];
        return coreLibVersion.replace(/[^0-9\.]/g, '');
      }
    }
    catch { }

    return undefined;
  }

  public options(): CommandOption[] {
    const options: CommandOption[] = [
      {
        option: '-v, --toVersion [toVersion]',
        description: 'The version of SharePoint Framework to which upgrade the project'
      }
    ];

    const parentOptions: CommandOption[] = super.options();
    parentOptions.forEach(o => {
      if (o.option.indexOf('--output') > -1) {
        o.description = 'Output type. json|text|md. Default text';
        o.autocomplete = ['json', 'text', 'md'];
      }
    })
    return options.concat(parentOptions);
  }

  public commandHelp(args: any, log: (help: string) => void): void {
    const chalk = vorpal.chalk;
    log(vorpal.find(commands.PROJECT_UPGRADE).helpInformation());
    log(
      `   ${chalk.yellow('Important:')} Run this command in the folder where the project
    that you want to upgrade is located. This command doesn't change your
    project files.
      
  Remarks:

    The ${this.name} command helps you upgrade your SharePoint Framework
    project to the specified version. If no version is specified, the command
    will upgrade to the latest version of the SharePoint Framework it supports
    (v1.5.0).

    This command doesn't change your project files. Instead, it gives you
    a report with all steps necessary to upgrade your project to the specified
    version of the SharePoint Framework. Changing project files is error-prone,
    especially when it comes to updating your solution's code. This is why at
    this moment, this command produces a report that you can use yourself to
    perform the necessary updates and verify that everything is working as
    expected.

    Using this command you can upgrade SharePoint Framework projects built using
    SharePoint Framework v1.4.1 to SharePoint Framework v1.5.0.

  Examples:
  
    Get instructions to upgrade the current SharePoint Framework project to
    SharePoint Framework version 1.5.0 and save the findings in a Markdown file
      ${chalk.grey(config.delimiter)} ${this.name} --toVersion 1.5.0 --output md > upgrade-report.md

    Get instructions to Upgrade the current SharePoint Framework project to
    SharePoint Framework version 1.5.0 and show the summary of the findings
    in the shell
      ${chalk.grey(config.delimiter)} ${this.name} --toVersion 1.5.0

    Get instructions to upgrade the current SharePoint Framework project to the
    latest SharePoint Framework version supported by the Office 365 CLI
      ${chalk.grey(config.delimiter)} ${this.name}
`);
  }
}

module.exports = new SpfxProjectUpgradeCommand();