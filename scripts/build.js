import babel from "@babel/core"
import svgr from "@svgr/core"
import { pascalCase } from "change-case"
import path from "path"
import fs from "fs/promises"

const manifest = require.resolve("@material-symbols/svg-700/package.json")
const baseURL = Bun.pathToFileURL(path.dirname(manifest) + "/")

const tsHeader = [
  'import * as React from "react"',
  "",
  `export interface IconProps extends React.SVGProps<SVGSVGElement> {`,
  "  title?: string",
  "  titleId?: string",
  "}",
  "",
  "",
].join("\n")

/** @param {string} file */
function getName(file) {
  const raw = "md-" + file.replace(".svg", "").replace(/_/g, "-")
  return pascalCase(raw).replace(/_/g, "")
}

async function readIcons() {
  const url = new URL("./rounded/", baseURL)
  const files = await fs.readdir(url)

  const promises = files.map(async (file) => {
    const content = await Bun.file(new URL(file, url)).text()
    return { content, name: getName(file) }
  })

  return Promise.all(promises)
}

/**
 * @param {string} folder
 */
async function process(folder, icons) {
  const outputURL = new URL(`../${folder}/`, import.meta.url)
  await fs.mkdir(outputURL, { recursive: true })

  // index.js
  const index = icons
    .map(({ name }) => `export { default as ${name} } from './${name}.js'`)
    .join("\n")

  // index.d.ts
  const indexTS = icons
    .map(({ name }) => {
      return `declare const ${name}: React.ForwardRefExoticComponent<IconProps>`
    })
    .join("\n")

  await Bun.write(new URL("./index.js", outputURL), index)
  await Bun.write(new URL("./index.d.ts", outputURL), tsHeader + indexTS)

  // Icon files
  const promises = icons.map(async ({ content, name }) => {
    const component = await svgr.transform(
      content,
      {
        dimensions: false,
        ref: true,
        svgProps: {
          "aria-hidden": "true",
          fill: "currentColor",
        },
      },
      { componentName: name }
    )

    const { code } = await babel.transformAsync(component, {
      plugins: [
        [require("@babel/plugin-transform-react-jsx"), { useBuiltIns: true }],
      ],
    })

    await Bun.write(new URL(`./${name}.js`, outputURL), code)
  })

  await Promise.all(promises)
}

const icons = await readIcons()

// Solid icons
await process(
  "solid",
  icons
    .filter(({ name }) => name.endsWith("Fill"))
    .map((icon) => ({ ...icon, name: icon.name.replace(/Fill$/, "") }))
)

// Outlined icons
await process(
  "outline",
  icons.filter(({ name }) => !name.endsWith("Fill"))
)
