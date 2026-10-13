from math import asin, cos, radians, sin, sqrt


def distance_meters(first, second):
    longitude_delta = radians(second[0] - first[0])
    latitude_delta = radians(second[1] - first[1])
    value = sin(latitude_delta / 2) ** 2 + cos(radians(first[1])) * cos(radians(second[1])) * sin(longitude_delta / 2) ** 2
    return 6371000 * 2 * asin(min(1, sqrt(value)))


def choose_vehicle(request, vehicles, online):
    candidates = [vehicle for vehicle in vehicles.values() if not vehicle.get('diagnostic', False) and online(vehicle['id']) and vehicle['task_id'] is None and vehicle['passenger_capacity'] >= request['passenger_count']]
    return min(candidates, key=lambda vehicle: (distance_meters(vehicle['position'], request['pickup']), vehicle['id']), default=None)
