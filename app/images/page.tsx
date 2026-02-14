// app/images/page.tsx
import ProtectedImages from './ProtectedImages';

export default function ImagesPage() {
  return (
    <main style={{ padding: '2rem' }}>
      <ProtectedImages />
    </main>
  );
}
