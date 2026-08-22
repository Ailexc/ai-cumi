import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

interface Props {
  dataUrl: string;
  alt: string;
}

export default function ImagePreview({ dataUrl, alt }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={dataUrl}
        alt={alt}
        className="max-h-[80vh] cursor-zoom-in rounded-lg border border-border shadow-sm"
        onClick={() => setOpen(true)}
      />
      <Lightbox open={open} close={() => setOpen(false)} slides={[{ src: dataUrl, alt }]} />
    </>
  );
}
