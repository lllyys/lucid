// WI-1 app shell: structural placeholder only. The heading is the product
// wordmark (a brand mark, not localized — like a company name). All localizable
// UI copy is routed through t() in WI-7 when the i18n scaffold lands.
export default function App() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-semibold">Lucid</h1>
    </main>
  )
}
