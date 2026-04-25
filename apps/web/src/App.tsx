import { Route, Switch } from 'wouter';
import { Landing } from './pages/Landing.js';
import { Room } from './pages/Room.js';
import { DemoBanner } from './components/DemoBanner.js';

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <DemoBanner />
      <div className="flex-1">
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/r/:code" component={Room} />
          <Route>
            <div className="p-8">Not found</div>
          </Route>
        </Switch>
      </div>
    </div>
  );
}
