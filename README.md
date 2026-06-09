<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/isaaclins/augment">
    <img src="docs/proof/01-built-app-signin.png" alt="Augment" width="640">
  </a>

  <h3 align="center">Augment</h3>

  <p align="center">
    A private, single-user Gmail desktop client for macOS — rules, snooze,
    watch-for-reply, and AI triage, layered on top of Gmail with zero remote
    content.
    <br />
    <a href="docs/SETUP.md"><strong>Setup guide »</strong></a>
    <br />
    <br />
    <a href="docs/SECURITY.md">Architecture &amp; Security</a>
    &middot;
    <a href="https://github.com/isaaclins/augment/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/isaaclins/augment/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

Augment is a personal Gmail **augmentation** client. Gmail stays the source of
truth; Augment layers the power features other clients paywall — a rules engine,
snooze, watch-for-reply, AI triage, quick actions, and native macOS notifications —
directly on top.

It talks to the Gmail REST API from the TypeScript layer with an in-memory OAuth
token, renders mail with **zero remote content**, and uses a small Rust backend
only for the background scheduler, native notifications, and OAuth glue.

The OAuth scope is `gmail.modify` — read, label, archive. Augment never sends,
permanently deletes, or marks spam.

<p align="right">(<a href="#readme-top">back to top</a>)</p>


### Built With

* [![Tauri][Tauri]][Tauri-url]
* [![React][React.js]][React-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Rust][Rust]][Rust-url]
* [![Vite][Vite]][Vite-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

* **macOS** (Apple Silicon or Intel) with Xcode Command Line Tools
* **Node.js ≥ 20** and npm
* **Rust** (stable) via [rustup](https://rustup.rs)
* A **Google account** and a free Google Cloud project

### Installation

1. Set up your Google OAuth client — see [docs/SETUP.md](docs/SETUP.md).
2. Clone the repo
   ```sh
   git clone https://github.com/isaaclins/augment.git
   cd augment
   ```
3. Install dependencies
   ```sh
   npm install
   ```
4. Add your OAuth credentials to `.env`
   ```sh
   cp .env.example .env
   # edit .env, paste in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
   ```
5. Run the app
   ```sh
   npm run tauri dev
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

After **Sign in with Google** (a browser tab opens — approve, then return):

| Feature | What it does |
| --- | --- |
| **Inbox + reader** | Lists inbox threads, opens a conversation, renders the body sanitized. |
| **Rules engine** | `From/To/Subject/Body` conditions → add label / archive / mark read / star. Auto-applies on refresh. |
| **Snooze** | Archives a thread + tags `Augment/Snoozed`; at the chosen time it resurfaces in the inbox and fires a macOS notification. |
| **Watch for reply** | If no inbound reply arrives by the deadline, a macOS notification fires. |
| **AI triage** | Local Ollama model labels each thread; invented labels surface as approvals in the Assistant panel. |
| **Assistant** | Right-side chat panel — Ask / Request / Agent modes, acting on selection. |
| **Quick Actions** | User-defined macros (shortcut → ordered steps: tag, move, mark, snooze, compose, …). |
| **Private rendering** | Email renders as plaintext or HTML stripped of all remote content, inside a sandboxed iframe. |

### Build a release

```sh
npm run tauri build
# →  src-tauri/target/release/bundle/macos/Augment.app
# →  src-tauri/target/release/bundle/dmg/Augment_0.1.0_aarch64.dmg
```

### Tests

```sh
npm run test                 # frontend (Vitest)
npm run typecheck            # tsc --noEmit
cd src-tauri && cargo test   # Rust
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Inbox, reader, sanitizer, rules, snooze, watch-for-reply
- [x] AI triage with open taxonomy + invent → approve
- [x] Sort / filter view state
- [x] Assistant panel (Ask / Request / Agent)
- [x] Quick Actions + composer
- [ ] Always-on background scheduler daemon (currently fires only while app is open)
- [ ] Chunked agent loop with progress + Stop (lift the 40-row context cap)
- [ ] Cross-platform builds (currently macOS only)

See the [open issues](https://github.com/isaaclins/augment/issues) for the full list.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and
create a pull request. You can also simply open an issue with the tag
"enhancement". Don't forget to give the project a star!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>


### Top contributors

<a href="https://github.com/isaaclins/augment/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=isaaclins/augment" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

Distributed under the MIT License. See [`LICENSE.txt`](LICENSE.txt) for more
information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Isaac Lins — contact@isaaclins.com

Project Link: <https://github.com/isaaclins/augment>

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Tauri](https://tauri.app) — the desktop runtime
* [DOMPurify](https://github.com/cure53/DOMPurify) — sanitization
* [Ollama](https://ollama.com) — local LLM for triage and the assistant
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/isaaclins/augment.svg?style=for-the-badge
[contributors-url]: https://github.com/isaaclins/augment/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/isaaclins/augment.svg?style=for-the-badge
[forks-url]: https://github.com/isaaclins/augment/network/members
[stars-shield]: https://img.shields.io/github/stars/isaaclins/augment.svg?style=for-the-badge
[stars-url]: https://github.com/isaaclins/augment/stargazers
[issues-shield]: https://img.shields.io/github/issues/isaaclins/augment.svg?style=for-the-badge
[issues-url]: https://github.com/isaaclins/augment/issues
[license-shield]: https://img.shields.io/github/license/isaaclins/augment.svg?style=for-the-badge
[license-url]: https://github.com/isaaclins/augment/blob/main/LICENSE.txt

[Tauri]: https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white
[Tauri-url]: https://tauri.app/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Rust]: https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white
[Rust-url]: https://www.rust-lang.org/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
