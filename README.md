# PLUS EVR ERP

## Run As A Desktop App

Use `start-desktop.bat` to build the React frontend, start the ASP.NET API, and open the Electron desktop window.

Or run the steps from the project directory:

```bash
npm install
npm run build
npm run desktop
```

`npm run desktop:package` creates a Windows installer build in the `release` folder. The API must still be available on `http://localhost:5008` for login and data access.

## Web Development

Use `npm run dev` for the Vite development server.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
