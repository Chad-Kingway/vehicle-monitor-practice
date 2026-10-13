import bisect
import math


def distance_meters(start, end):
    longitude, latitude = map(math.radians, start)
    next_longitude, next_latitude = map(math.radians, end)
    value = math.sin((next_latitude - latitude) / 2) ** 2 + math.cos(latitude) * math.cos(next_latitude) * math.sin((next_longitude - longitude) / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0, 1 - value)))


def bearing(start, end):
    longitude, latitude = map(math.radians, start)
    next_longitude, next_latitude = map(math.radians, end)
    delta = next_longitude - longitude
    return math.degrees(math.atan2(math.sin(delta) * math.cos(next_latitude), math.cos(latitude) * math.sin(next_latitude) - math.sin(latitude) * math.cos(next_latitude) * math.cos(delta))) % 360


class RouteMotion:
    """以官方路線時間推進，按折線各段長度內插位置。"""

    def __init__(self, route):
        self.coordinates = route["coordinates"]
        self.duration = route["duration_seconds"]
        self.elapsed = 0.0
        self.lengths = [0.0]
        for start, end in zip(self.coordinates, self.coordinates[1:]):
            self.lengths.append(self.lengths[-1] + distance_meters(start, end))

    @property
    def progress(self):
        return min(1.0, self.elapsed / self.duration)

    def advance(self, seconds, multiplier):
        self.elapsed = min(self.duration, self.elapsed + max(0, seconds) * multiplier)
        target = self.lengths[-1] * self.progress
        index = min(len(self.coordinates) - 2, max(0, bisect.bisect_right(self.lengths, target) - 1))
        start, end = self.coordinates[index:index + 2]
        length = self.lengths[index + 1] - self.lengths[index]
        fraction = (target - self.lengths[index]) / length if length else 1.0
        position = [start[axis] + (end[axis] - start[axis]) * fraction for axis in (0, 1)]
        return position, bearing(start, end)


class DemoMotion:
    """診斷方形僅供位置與朝向檢查，不執行接送任務。"""

    def __init__(self, position):
        self.origin = position
        self.distance = 0.0

    def advance(self, seconds, speed_multiplier):
        self.distance = (self.distance + seconds * 5 * speed_multiplier) % 1200
        segment, offset = divmod(self.distance, 300)
        east, north, heading = [(offset, 0, 90), (300, offset, 0), (300 - offset, 300, 270), (0, 300 - offset, 180)][int(segment)]
        longitude, latitude = self.origin
        return [longitude + math.degrees(east / (6371000 * math.cos(math.radians(latitude)))), latitude + math.degrees(north / 6371000)], heading
