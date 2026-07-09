import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { GuardianPage } from "./pages/guardian";

export function render(): string {
  return renderToStaticMarkup(
    <Router ssrPath="/guardian">
      <GuardianPage />
    </Router>,
  );
}
