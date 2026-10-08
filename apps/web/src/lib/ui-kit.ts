/**
 * The component kit an installed plugin receives as the `hub.ui` service. A
 * plugin module imports nothing — it cannot resolve packages and it must use
 * the same React instance as the app — so whatever it renders with comes from
 * here.
 */
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Button } from "@workspace/ui/components/button"

export {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
}
