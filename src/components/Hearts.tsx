import heartSvg from "../assets/img/heart.svg";

export default function Hearts({
  total,
  left,
}: {
  total: number;
  left: number;
}) {
  return (
    <>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={"heart-slot " + (i < left ? "filled" : "empty")}
        >
          <img src={heartSvg} alt="heart" />
        </span>
      ))}
    </>
  );
}
