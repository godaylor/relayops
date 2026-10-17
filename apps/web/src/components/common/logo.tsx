import { Link } from "@tanstack/react-router";
import { BrandWordmark } from "@/components/relayops/brand";
import useProjectStore from "@/store/project";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "" }: LogoProps) {
  const { setProject } = useProjectStore();

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      className={`w-auto ${className}`}
    >
      <BrandWordmark />
    </Link>
  );
}
