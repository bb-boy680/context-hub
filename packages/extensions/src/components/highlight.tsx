/**
 * The query's own characters, marked in the accent.
 *
 * Only the first occurrence is marked: the lists this sits in mark the words
 * that matched, not every instance of them. A needle that is not there renders
 * the text untouched.
 */
export function Highlighted({ text, needle }: { text: string; needle: string }) {
  const at = needle === "" ? -1 : text.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-primary">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  )
}
