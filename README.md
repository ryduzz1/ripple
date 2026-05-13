<div align="center">

# Ripple

[![After Effects](https://img.shields.io/badge/After%20Effects-Plugin-9999FF?style=for-the-badge&logo=adobeaftereffects&logoColor=white)](https://www.adobe.com/products/aftereffects.html)
[![Version](https://img.shields.io/badge/Version-0.1.0-111827?style=for-the-badge)](/Users/ryder/Desktop/repos/ripple)

An After Effects CEP extension for faster editorial timing, trimming, sequencing, snapping, and timeline cleanup inside the active comp.

Created by `ryduzz`.

</div>

## What It Does

`Ripple` is an editorial timeline panel for After Effects focused on making layer timing easier to read and faster to change.

It scans the active composition, rebuilds the layer stack as a clean track-style timeline, and gives common editing actions a dedicated surface inside After Effects. Layers stay real AE layers, but Ripple makes footage, audio, text, solids, nulls, cameras, precomps, and adjustment-style timing easier to scan, trim, split, sequence, and organize without leaving the comp.

It is built for motion-heavy edits, social videos, lyric videos, trailers, reels, ads, YouTube edits, and projects where the final timing is happening inside After Effects but the native timeline is too slow for editorial work.

## Features

### Timeline View

- Read the active comp as a cleaner editorial timeline
- Show each AE layer as a clip block on its own lane
- Display layer names, timing, duration, comp frame rate, and playhead position
- Color-code common layer types like footage, audio, text, precomps, solids, cameras, and nulls
- Toggle layer badges, compact rows, and disabled layer visibility
- Zoom the timeline for tighter timing work or a broader comp overview

### Editorial Tools

- Split selected layers at the playhead
- Trim selected layer starts to the playhead
- Trim selected layer ends to the playhead
- Sequence selected layers from the current playhead position
- Close gaps across eligible visible layers
- Refresh the active comp timeline without reopening the panel

### After Effects Workflow

- Runs as a dockable CEP panel inside After Effects
- Writes timing changes back to normal AE layers
- Uses After Effects undo groups for panel commands
- Keeps the native AE layer stack intact
- Provides a foundation for ripple trims, magnetic snapping, markers, thumbnails, waveforms, linked audio/video moves, and faster drag editing

## Build And Package

Build the CEP extension folder:

```sh
npm run build
```

Build and install the extension into the local Adobe CEP extensions folder for testing:

```sh
npm run install:cep
```

Create a distributable zip from a fresh build:

```sh
npm run package
```

Create a signed ZXP from a fresh build:

```sh
ZXP_PASSWORD="your-certificate-password" npm run zxp
```

If `npm` is not available but Node is installed, run the package script directly:

```sh
node scripts/package.mjs
```

The local install command copies `dist/Ripple` to `~/Library/Application Support/Adobe/CEP/extensions/Ripple`. The zip package is written to `release/Ripple-<version>.zip`. The signed ZXP is written to `release/Ripple-<version>.zxp`. Generated `dist/` and `release/` output is intentionally ignored by git.

The ZXP script uses `/Users/ryder/Desktop/zxp-sign/ZXPSignCmd` and `certs/Ripple.p12` by default. Override those paths with `ZXP_SIGN_CMD` or `ZXP_CERT` if needed. To timestamp the signature, pass `ZXP_TSA_URL`.

## Manual CEP Install

For local testing on macOS, run `npm run install:cep`.

To install a zip manually, unzip the release package and place the `Ripple` folder in the Adobe CEP extensions directory for your platform.

Common extension directories:

- macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
- Windows: `%APPDATA%\Adobe\CEP\extensions\`

After copying the folder, restart After Effects and open `Window > Extensions > Ripple`.

## Unsigned Extension Setup

If installing from the zip instead of a signed ZXP, enable unsigned CEP extensions before After Effects will load the panel.

On macOS, enable CEP debug mode for the relevant CSXS versions:

```sh
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

Restart After Effects after changing CEP settings.

## Distribution

The package can be distributed as the generated zip with unsigned-install instructions, or as the signed ZXP for a smoother public install path.
