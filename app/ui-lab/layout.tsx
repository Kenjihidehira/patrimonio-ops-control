// Mesma ordem de folhas do `/demo`: `enterprise.css` depois de
// `patrimonio.css`, porque varias regras dependem dessa precedencia. Trocar a
// ordem aqui faria o laboratorio mentir sobre o que a tela real mostra.
import "../demo/patrimonio.css";
import "../demo/enterprise.css";

export default function UiLabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
