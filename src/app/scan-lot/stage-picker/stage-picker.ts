import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScanLotService } from '../scan-lot.service';

@Component({
  selector: 'app-stage-picker',
  imports: [RouterLink],
  templateUrl: './stage-picker.html',
  styleUrl: './stage-picker.css',
})
export class StagePickerComponent {
  readonly store = inject(ScanLotService);
}
