import ru from "../../../i18n/ru-RU.json";
import { Portfolio } from "../components/portfolio";

export default function HomePage() {
  return <Portfolio copy={ru.portfolio} locale="ru" />;
}
