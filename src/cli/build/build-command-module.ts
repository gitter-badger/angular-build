import * as yargs from 'yargs';

import { colorize } from '../../utils/colorize';

export function getBuildCommandModule(cliVersion: string): yargs.CommandModule {
    const buildCommandUsage = `${colorize(`angular-build ${cliVersion}`, 'white')}\n
Usage:
  ngb build [options...]`;

    const buildCommandModule: yargs.CommandModule = {
        command: 'build',
        describe: 'Build the project(s)',
        builder: (yargv: yargs.Argv) => {
            const yargvObj = yargv
                .usage(buildCommandUsage)
                .example('ngb build', 'Build the project(s) using angular-build.json file')
                .help('h')
                .option('config',
                    {
                        alias: 'c',
                        describe: 'The angular-build.json file location.',
                        type: 'string',
                    })
                .option('forceUseLocalCli',
                    {
                        describe: 'To force use locally installed cli.',
                        type: 'boolean',
                        boolean: true
                    })
                .option('env',
                    {
                        alias: 'environment',
                        describe: 'Define the build environment.'
                    })
                .option('filter',
                    {
                        describe: 'Filter config by name(s).',
                        type: 'array',
                        array: true
                    })
                .option('clean',
                    {
                        describe: 'Clean output directory before build.',
                        type: 'boolean',
                        boolean: true
                    })
                .option('progress',
                    {
                        describe: 'Display compilation progress in percentage.',
                        type: 'boolean',
                        boolean: true
                    })
                .option('verbose',
                    {
                        describe: 'Add more details to output logging.',
                        type: 'boolean',
                        boolean: true
                    })
                .option('watch',
                    {
                        describe: 'Build with watch mode.',
                        type: 'boolean',
                        boolean: true
                    })
                .option('beep',
                    {
                        describe: 'Beep when build completed.',
                        type: 'boolean',
                        boolean: true
                    });

            // if (schemaPart) {
            //    const buildOptionsSchema = schemaPart as any;
            //    Object.keys(buildOptionsSchema)
            //        .filter((key: string) => key !== 'env' && key !== 'environment' && key !== 'stats')
            //        .forEach(
            //        (key: string) => {
            //            yargvObj = yargvObj.options(chageDashCase(key),
            //                {
            //                    describe: buildOptionsSchema[key].description || key,
            //                    type: yargsTypeMap(buildOptionsSchema[key].type),
            //                    default: undefined
            //                });
            //        });
            // }

            return yargvObj;
        },
        handler: (null as any)
    };
    return buildCommandModule;
}
