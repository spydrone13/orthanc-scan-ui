import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StageService } from '../stage.service';

@Component({
  selector: 'app-stage-picker',
  imports: [RouterLink],
  templateUrl: './stage-picker.html',
  styleUrl: './stage-picker.css',
})
export class StagePickerComponent {
  readonly stageService = inject(StageService);
}
