# UniFeedback Assistant

**Version:** 1.2.1

A student-controlled Chrome extension for scanning feedback questions on the current page, selecting ratings, reviewing them, and applying them to supported dropdown and radio-button questions.

## Features

- Scan the current page for supported feedback questions.
- Apply the same rating to every detected question, or choose ratings individually.
- Optionally fill only unanswered questions.
- Review selections before applying them.
- The extension does **not** click Finish or submit the form.

## Installation (Chrome)

1. Download the repository ZIP using **Code → Download ZIP**, or clone this repository.
2. Extract the ZIP.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the extracted project folder.

## Usage

1. Open the feedback form in the active tab.
2. Click the UniFeedback Assistant extension icon.
3. Select **Scan this page**.
4. Choose a fill mode and rating preferences.
5. Review the detected questions and click **Apply selected ratings**.
6. Review the form yourself and submit it manually when ready.

## Privacy

The extension is designed for local, student-controlled use. It does not submit feedback automatically. See [PRIVACY.md](PRIVACY.md) for details.

## Version scope

This repository contains the original **v1.2.1 Click Save Fix** build. It does not include the later v2.0 auto-detection or v2.1 one-click rating builds.
