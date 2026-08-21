interface Props {
  name: string;
  skin: string;
  size?: number;
}

export function Avatar({ name, skin, size = 48 }: Props) {
  const suffix = skin === "green" ? "-green" : "";
  return (
    <span className="avatar" style={{ width: size, height: size }} role="img" aria-label={`${name}的立绘头像`}>
      <img src={`./assets/character/koko-base${suffix}.png`} alt="" />
    </span>
  );
}
