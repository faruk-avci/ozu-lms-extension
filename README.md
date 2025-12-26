# Ozyegin LMS Archiver

A browser extension that helps students build a structured, offline archive of their course materials. 

Designed for Ozyegin University LMS (Moodle), this tool automates the process of organizing lecture notes, slides, and resources into a local library.


## Why I Built This
LMS access is often temporary. I wanted a way to:
1.  **Own my data:** Keep a permanent copy of the materials I studied.
2.  **Browse offline:** Access course content without needing to log in or have internet.
3.  **Stay organized:** Eliminate the mess of downloading files one by one into a generic "Downloads" folder.

## Key Features
* **Smart Selection:** Select content by Week/Topic, with planned support for file-type filtering.
*   **Structured Output:** Downloads are automatically zipped into folders: `Course Name > Week X > File`.
*   **Offline Dashboard:** Generates a searchable `index.html` file inside the Zip. It feels like browsing the website, but it's 100% local.
*   **Privacy First:** Runs entirely on the client-side. No data is sent to any external server.

## Installation (Developer Mode)
Since this is a personal tool, it is not listed on the Chrome Web Store. To use it:

1.  **Download:** Clone this repo or download the ZIP.
2.  **Open Chrome Extensions:** Go to `chrome://extensions/`.
3.  **Enable Developer Mode:** Toggle the switch in the top-right corner.
4.  **Load Unpacked:** Click the button and select the folder containing `manifest.json`.
5.  **Run:** Go to the LMS course page and refresh. You will see the new "Download Materials" buttons.

## Tech Stack
*   **JavaScript (Vanilla):** DOM manipulation and logic.
*   **Manifest V3:** Modern browser extension standard.
*   **JSZip:** For client-side compression and folder
