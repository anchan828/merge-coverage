#!/usr/bin/env node
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import yargs from "yargs";

const args = yargs
  .option("packages", {
    string: true,
    default: "packages",
    description: "packages directory path",
  })
  .option("coverage", {
    string: true,
    default: "coverage",
    description: "packages directory path",
  })
  .option("root", {
    string: true,
    default: process.cwd(),
    description: "root",
  })
  .argv;

const PACKAGES_DIR = args.packages;
const COVERAGE_DIR = args.coverage;
const ROOT = args.root;

interface CoverageProperty {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}
type CoveragePropertyType = keyof CoverageProperty;
interface TotalProperty {
  lines: CoverageProperty;
  functions: CoverageProperty;
  statements: CoverageProperty;
  branches: CoverageProperty;
}

class JsonSummary {
  public data: {
    total: TotalProperty;
    [filePath: string]: TotalProperty;
  } = {
    total: {
      branches: {
        covered: 0,
        pct: 0,
        skipped: 0,
        total: 0,
      },
      functions: {
        covered: 0,
        pct: 0,
        skipped: 0,
        total: 0,
      },
      lines: {
        covered: 0,
        pct: 0,
        skipped: 0,
        total: 0,
      },
      statements: {
        covered: 0,
        pct: 0,
        skipped: 0,
        total: 0,
      },
    },
  };

  constructor(filePath?: string) {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      this.data = data;
    }
  }

  public merge(filePath: string): void {
    const { data } = new JsonSummary(filePath);

    if (data.total) {
      this.data.total = this.mergeTotalProperty(this.data.total, data.total);
    }

    const fileCoverageKeys = Object.keys(data).filter((key) => key !== "total");

    for (const fileCoverageKey of fileCoverageKeys) {
      this.data[fileCoverageKey] = data[fileCoverageKey];
    }
  }

  public write(dist: string): void {
    if (!fs.existsSync(path.dirname(dist))) {
      fs.mkdirSync(path.dirname(dist));
    }

    fs.writeFileSync(dist, JSON.stringify(this.data));
  }

  private mergeTotalProperty(
    left: TotalProperty,
    right: TotalProperty
  ): TotalProperty {
    const totalPropertyKeys = Object.keys(left).map(
      (key: string) => key as keyof TotalProperty
    );

    totalPropertyKeys.forEach((coveragePropertyType: keyof TotalProperty) => {
      left[coveragePropertyType] = this.mergeCoverageProperty(
        left[coveragePropertyType],
        right[coveragePropertyType]
      );
    });
    return left;
  }

  private mergeCoverageProperty(
    left: CoverageProperty,
    right: CoverageProperty
  ): CoverageProperty {
    const coveragePropertyKeys = Object.keys(left).map(
      (key: string) => key as keyof CoverageProperty
    );
    coveragePropertyKeys.forEach(
      (coveragePropertyType: keyof CoverageProperty) => {
        if (typeof right[coveragePropertyType] === "number") {
          if (coveragePropertyType !== "pct") {
            left[coveragePropertyType] += right[coveragePropertyType];
          }
        }
      }
    );

    left.pct = this.calcPercent(left);

    return left;
  }

  private calcPercent(coverageProperty: CoverageProperty): number {
    if (coverageProperty.total > 0) {
      return (
        Math.floor(
          ((1000 * 100 * coverageProperty.covered) / coverageProperty.total +
            5) /
            10
        ) / 100
      );
    } else {
      return 100.0;
    }
  }
}

class Lcov {
  public data: string[] = [];

  constructor(filePath?: string) {
    if (filePath) {
      this.read(filePath);
    }
  }

  public merge(filePath: string): void {
    this.read(filePath);
  }

  public write(dist: string): void {
    if (!fs.existsSync(path.dirname(dist))) {
      fs.mkdirSync(path.dirname(dist));
    }

    fs.writeFileSync(dist, this.data.filter((d) => d).join("\n"));
  }

  private read(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const text = fs.readFileSync(filePath, "utf8");
    const packageRoot = path
      .relative(process.cwd(), filePath)
      .replace(`/${COVERAGE_DIR}/lcov.info`, "");
    this.data.push(text.replace(/^SF:src/gm, `SF:${packageRoot}/src`));
  }
}

const summaryFiles = glob.sync(
  path.resolve(
    ROOT,
    `${PACKAGES_DIR}/*/${COVERAGE_DIR}/coverage-summary.json`
  )
);
const lcovFiles = glob.sync(
  path.resolve(ROOT, `${PACKAGES_DIR}/*/${COVERAGE_DIR}/lcov.info`)
);

const jsonSummary = new JsonSummary();
const lcov = new Lcov();

for (const file of summaryFiles) {
  jsonSummary.merge(file.toString());
}

for (const lcovFile of lcovFiles) {
  lcov.merge(lcovFile.toString());
}

jsonSummary.write(
  path.resolve(ROOT, `${COVERAGE_DIR}/coverage-summary.json`)
);
lcov.write(path.resolve(ROOT, `${COVERAGE_DIR}/lcov.info`));
