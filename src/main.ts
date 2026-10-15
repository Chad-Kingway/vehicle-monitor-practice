import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { WorkspaceComponent } from './app/workspace.component';

bootstrapApplication(WorkspaceComponent, { providers: [provideHttpClient()] }).catch(console.error);
