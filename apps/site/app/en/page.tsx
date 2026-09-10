import en from "../../../../i18n/en-US.json";
import { Portfolio } from "../../components/portfolio";

export default function EnglishHomePage() {
  return <Portfolio copy={en.portfolio} locale="en" />;
}
